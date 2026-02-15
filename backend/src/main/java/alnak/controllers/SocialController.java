package alnak.controllers;

import alnak.business_logic.entities.Friendship;
import alnak.business_logic.entities.Post;
import alnak.dto.SocialDTOs.*;
import alnak.services.SocialService;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.List;
import java.util.Map;

/**
 * HTTP adapter for social features.
 * All auth (extracting userId from JWT) is handled in the route layer
 * before calling these methods — this class only receives already-resolved ids.
 *
 * Intended route registrations:
 *
 *   POST   /api/social/posts
 *   GET    /api/social/posts/{id}
 *   PUT    /api/social/posts/{id}
 *   DELETE /api/social/posts/{id}
 *
 *   GET    /api/social/users/{userId}/posts
 *   GET    /api/social/recipes/{recipeId}/posts
 *   GET    /api/social/feed
 *
 *   POST   /api/social/recipes/{recipeId}/rate
 *   GET    /api/social/recipes/{recipeId}/rating
 *   GET    /api/social/recipes/{recipeId}/rating/friends
 *   GET    /api/social/recipes/{recipeId}/rating/friends/top
 *
 *   POST   /api/social/friends/request
 *   POST   /api/social/friends/{friendshipId}/accept
 *   POST   /api/social/friends/{friendshipId}/decline
 *   DELETE /api/social/friends/{friendshipId}
 *   GET    /api/social/friends
 *   GET    /api/social/friends/requests/received
 *   GET    /api/social/friends/requests/sent
 */
public class SocialController {

    private final SocialService socialService;
    private final ObjectMapper mapper;

    public SocialController(SocialService socialService) {
        this.socialService = socialService;
        this.mapper = new ObjectMapper()
                .findAndRegisterModules();  // registers JavaTimeModule for LocalDateTime
    }

    // ── Posts ─────────────────────────────────────────────────────

    public PostResponse createPost(long authenticatedUserId, String body) throws Exception {
        CreatePostRequest req = mapper.readValue(body, CreatePostRequest.class);
        Post post = socialService.createPost(
                authenticatedUserId,
                req.recipeId(),
                req.picturePath(),
                req.description(),
                req.rating()
        );
        return PostResponse.from(post);
    }

    public PostResponse getPost(long postId) {
        return PostResponse.from(socialService.getPost(postId));
    }

    public PostResponse updatePost(long postId, long authenticatedUserId, String body) throws Exception {
        UpdatePostRequest req = mapper.readValue(body, UpdatePostRequest.class);
        Post post = socialService.updatePost(postId, authenticatedUserId,
                req.description(), req.rating());
        return PostResponse.from(post);
    }

    public void deletePost(long postId, long authenticatedUserId) {
        socialService.deletePost(postId, authenticatedUserId);
    }

    public List<PostResponse> getPostsByUser(long userId) {
        return PostResponse.fromList(socialService.getPostsByUser(userId));
    }

    public List<PostResponse> getPostsByRecipe(int recipeId) {
        return PostResponse.fromList(socialService.getPostsByRecipe(recipeId));
    }

    public FeedResponse getFeed(long authenticatedUserId) {
        List<PostResponse> posts = PostResponse.fromList(
                socialService.getFeed(authenticatedUserId));
        return new FeedResponse(posts, posts.size());
    }

    // ── Ratings ───────────────────────────────────────────────────

    public RecipeRatingResponse rateRecipe(long authenticatedUserId,
                                           int recipeId, String body) throws Exception {
        RateRecipeRequest req = mapper.readValue(body, RateRecipeRequest.class);
        socialService.rateRecipe(authenticatedUserId, recipeId, req.rating());
        return buildRatingResponse(authenticatedUserId, recipeId);
    }

    public RecipeRatingResponse getRecipeRating(long authenticatedUserId, int recipeId) {
        return buildRatingResponse(authenticatedUserId, recipeId);
    }

    public Map<Long, Integer> getFriendRatings(long authenticatedUserId, int recipeId) {
        return socialService.getFriendRatingsForRecipe(authenticatedUserId, recipeId);
    }

    public List<Integer> getTopRatedByFriends(long authenticatedUserId, int limit) {
        return socialService.getTopRatedByFriends(authenticatedUserId, limit);
    }

    // ── Friends ───────────────────────────────────────────────────

    public FriendshipResponse sendFriendRequest(long authenticatedUserId, String body) throws Exception {
        FriendRequestBody req = mapper.readValue(body, FriendRequestBody.class);
        Friendship f = socialService.sendFriendRequest(authenticatedUserId, req.addresseeId());
        return FriendshipResponse.from(f);
    }

    public void acceptFriendRequest(long friendshipId, long authenticatedUserId) {
        socialService.acceptFriendRequest(friendshipId, authenticatedUserId);
    }

    public void declineFriendRequest(long friendshipId, long authenticatedUserId) {
        socialService.declineFriendRequest(friendshipId, authenticatedUserId);
    }

    public void removeFriend(long friendshipId, long authenticatedUserId) {
        socialService.removeFriend(friendshipId, authenticatedUserId);
    }

    public FriendListResponse getFriends(long authenticatedUserId) {
        List<Long> ids = socialService.getFriendIds(authenticatedUserId);
        List<FriendUserResponse> friends = socialService.getFriendSummaries(authenticatedUserId).stream()
                .map(friend -> new FriendUserResponse(friend.id(), friend.name(), friend.email()))
                .toList();
        return new FriendListResponse(ids, friends, ids.size());
    }

    public List<UserSearchResponse> searchUsers(long authenticatedUserId, String query, Integer limitRaw) {
        int limit = limitRaw == null ? 10 : limitRaw;
        return socialService.searchUsersForFriendRequest(authenticatedUserId, query, limit).stream()
                .map(item -> new UserSearchResponse(item.id(), item.name(), item.email(), item.relationStatus()))
                .toList();
    }

    public List<FriendshipResponse> getPendingReceivedRequests(long authenticatedUserId) {
        return FriendshipResponse.fromList(
                socialService.getPendingReceivedRequests(authenticatedUserId));
    }

    public List<FriendshipResponse> getPendingSentRequests(long authenticatedUserId) {
        return FriendshipResponse.fromList(
                socialService.getPendingSentRequests(authenticatedUserId));
    }

    // ── Communities ─────────────────────────────────────────

    public CommunityResponse createCommunity(long authenticatedUserId, String body) throws Exception {
        CommunityCreateRequest req = mapper.readValue(body, CommunityCreateRequest.class);
        var community = socialService.createCommunity(authenticatedUserId, req.name());
        return new CommunityResponse(
                community.id(),
                community.ownerUserId(),
                community.name(),
                community.memberIds(),
                community.pendingInviteUserIds()
        );
    }

    public CommunityResponse renameCommunity(long communityId, long authenticatedUserId, String body) throws Exception {
        CommunityRenameRequest req = mapper.readValue(body, CommunityRenameRequest.class);
        var community = socialService.renameCommunity(communityId, authenticatedUserId, req.name());
        return new CommunityResponse(
                community.id(),
                community.ownerUserId(),
                community.name(),
                community.memberIds(),
                community.pendingInviteUserIds()
        );
    }

    public void inviteFriendToCommunity(long communityId, long authenticatedUserId, String body) throws Exception {
        CommunityInviteRequest req = mapper.readValue(body, CommunityInviteRequest.class);
        socialService.inviteFriendToCommunity(communityId, authenticatedUserId, req.friendUserId());
    }

    public List<CommunityResponse> getMyCommunities(long authenticatedUserId) {
        return socialService.getMyCommunities(authenticatedUserId).stream()
                .map(item -> new CommunityResponse(
                        item.id(),
                        item.ownerUserId(),
                        item.name(),
                        item.memberIds(),
                        item.pendingInviteUserIds()
                ))
                .toList();
    }

    public List<CommunityInviteResponse> getPendingCommunityInvites(long authenticatedUserId) {
        return socialService.getPendingCommunityInvites(authenticatedUserId).stream()
                .map(item -> new CommunityInviteResponse(
                        item.communityId(),
                        item.communityName(),
                        item.inviterId(),
                        item.inviterName(),
                        item.createdAt()
                ))
                .toList();
    }

    public void acceptCommunityInvite(long communityId, long authenticatedUserId) {
        socialService.acceptCommunityInvite(authenticatedUserId, communityId);
    }

    public void declineCommunityInvite(long communityId, long authenticatedUserId) {
        socialService.declineCommunityInvite(authenticatedUserId, communityId);
    }

    // ── Private helpers ───────────────────────────────────────────

    private RecipeRatingResponse buildRatingResponse(long userId, int recipeId) {
        int userRating = socialService.getUserRating(userId, recipeId).orElse(0);
        Double avg     = socialService.getAverageRating(recipeId).orElse(null);
        Double avgFriend = socialService.getAverageFriendRating(userId, recipeId).orElse(null);
        Map<Long, Integer> friendRatings =
                socialService.getFriendRatingsForRecipe(userId, recipeId);
        return new RecipeRatingResponse(recipeId, userRating, avg, avgFriend, friendRatings);
    }
}
