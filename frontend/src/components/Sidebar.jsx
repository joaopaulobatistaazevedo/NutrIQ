import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Camera, ChevronRight, LogOut } from 'lucide-react';
import { getMainNavItems } from '../config/navigation';
import { AUTH_KEY, PROFILE_KEY } from '../constants/storageKeys';
import { getAuthSession } from '../utils/authSession';
import { getUserRole } from '../utils/authSession';
import { uploadProfilePhoto } from '../services/userService';
import { useSocialNotifications } from '../context/SocialNotificationContext';
import '../styles/sidebar.css';

const clearNutribotSessionData = () => {
  const keysToRemove = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key) continue;
    if (key === PROFILE_KEY || key === AUTH_KEY || key.startsWith('nutribot_chat_')) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => localStorage.removeItem(key));
};

function formatInviteSource(friendCount, communityCount) {
  const friends = Number(friendCount || 0);
  const communities = Number(communityCount || 0);

  if (friends > 0 && communities > 0) {
    return `${friends} amigo(s) · ${communities} comunidade(s)`;
  }
  if (friends > 0) {
    return `${friends} pedido(s) de amizade`;
  }
  if (communities > 0) {
    return `${communities} convite(s) de comunidade`;
  }
  return '';
}

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const role = getUserRole();
  const navItems = useMemo(() => getMainNavItems(role), [role]);
  const {
    pendingSocialNotificationCount,
    pendingFriendRequestCount,
    pendingCommunityInviteCount,
    refresh,
  } = useSocialNotifications();

  const [showNutriSocialPopup, setShowNutriSocialPopup] = useState(false);
  const [popupCount, setPopupCount] = useState(0);
  const [isUploadingProfilePhoto, setIsUploadingProfilePhoto] = useState(false);
  const [profileUploadStatus, setProfileUploadStatus] = useState('');

  const previousCountRef = useRef(0);
  const profilePhotoInputRef = useRef(null);

  const isActive = (path) => location.pathname === path;

  const handleLogout = () => {
    clearNutribotSessionData();
    navigate('/login');
  };

  const handleOpenProfilePhotoPicker = (event) => {
    event.stopPropagation();
    if (isUploadingProfilePhoto) return;
    profilePhotoInputRef.current?.click();
  };

  const handleProfilePhotoSelected = async (event) => {
    const file = event.target?.files?.[0];
    event.target.value = '';

    if (!file || isUploadingProfilePhoto) {
      return;
    }

    const authSession = getAuthSession();
    const token = String(authSession?.token || '').trim();
    if (!token) {
      setProfileUploadStatus('Sessão inválida.');
      return;
    }

    try {
      setIsUploadingProfilePhoto(true);
      setProfileUploadStatus('A enviar foto...');
      await uploadProfilePhoto(token, file);
      setProfileUploadStatus('Foto atualizada.');
      window.dispatchEvent(new CustomEvent('profile:photo-updated'));
      void refresh();
      window.setTimeout(() => setProfileUploadStatus(''), 2200);
    } catch (error) {
      setProfileUploadStatus(String(error?.message || 'Falha no upload da foto.'));
      window.setTimeout(() => setProfileUploadStatus(''), 3200);
    } finally {
      setIsUploadingProfilePhoto(false);
    }
  };

  useEffect(() => {
    const previous = Number(previousCountRef.current || 0);
    const current = Number(pendingSocialNotificationCount || 0);
    previousCountRef.current = current;

    if (current > previous && current > 0) {
      setPopupCount(current);
      setShowNutriSocialPopup(true);

      const timeout = setTimeout(() => {
        setShowNutriSocialPopup(false);
      }, 5000);

      return () => clearTimeout(timeout);
    }

    if (current === 0) {
      setShowNutriSocialPopup(false);
      setPopupCount(0);
    }

    return undefined;
  }, [pendingSocialNotificationCount]);

  return (
    <div className="sidebar">
      <div className="sidebar-logo">
        <span className="sidebar-logo-text">NutrIQ</span>
      </div>
      <nav className="sidebar-nav">
        <input
          ref={profilePhotoInputRef}
          type="file"
          accept="image/*"
          className="sidebar-hidden-input"
          onChange={handleProfilePhotoSelected}
        />

        {navItems.map((item) => {
          const Icon = item.icon;
          const isNutriSocial = item.path === '/nutrisocial';
          const isProfile = item.path === '/profile';
          const count = isNutriSocial ? pendingSocialNotificationCount : 0;

          return (
            <button
              key={item.path}
              className={`sidebar-item ${isActive(item.path) ? 'active' : ''} ${isNutriSocial ? 'sidebar-item-nutrisocial' : ''}`}
              onClick={() => navigate(item.path)}
              title={`${item.label} (${item.shortcut})`}
              aria-keyshortcuts={item.shortcut}
            >
              <Icon className="sidebar-item-icon" />
              <span className="sidebar-item-label">
                {item.label}
                {count > 0 && (
                  <span className="sidebar-nutrisocial-badge">
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </span>

              {isNutriSocial && (pendingFriendRequestCount > 0 || pendingCommunityInviteCount > 0) ? (
                <span className="sidebar-invite-sources" aria-label="Origem dos convites">
                  {pendingFriendRequestCount > 0 ? <span className="sidebar-source-chip">A:{pendingFriendRequestCount}</span> : null}
                  {pendingCommunityInviteCount > 0 ? <span className="sidebar-source-chip">C:{pendingCommunityInviteCount}</span> : null}
                </span>
              ) : null}

              {isProfile ? (
                <span className="sidebar-profile-actions" onClick={(event) => event.stopPropagation()}>
                  <button
                    type="button"
                    className="sidebar-profile-camera-btn"
                    onClick={handleOpenProfilePhotoPicker}
                    title="Adicionar foto de perfil"
                    aria-label="Adicionar foto de perfil"
                    disabled={isUploadingProfilePhoto}
                  >
                    <Camera size={14} />
                  </button>
                </span>
              ) : null}

              <span className="sidebar-item-kbd" aria-hidden="true">{item.shortcut}</span>
              <ChevronRight className="sidebar-item-arrow" />

              {isNutriSocial && showNutriSocialPopup && (
                <span className="sidebar-nutrisocial-popup" role="status" aria-live="polite">
                  {popupCount > 1 ? `${popupCount} convites novos` : '1 convite novo'}
                  {formatInviteSource(pendingFriendRequestCount, pendingCommunityInviteCount)
                    ? ` · ${formatInviteSource(pendingFriendRequestCount, pendingCommunityInviteCount)}`
                    : ''}
                </span>
              )}
            </button>
          );
        })}
      </nav>
      <div className="sidebar-footer">
        {profileUploadStatus ? <div className="sidebar-upload-status">{profileUploadStatus}</div> : null}
        <button className="sidebar-logout" onClick={handleLogout}>
          <LogOut className="sidebar-item-icon" />
          <span className="sidebar-item-label">Sair</span>
          <ChevronRight className="sidebar-item-arrow" />
        </button>
      </div>
    </div>
  );
}
