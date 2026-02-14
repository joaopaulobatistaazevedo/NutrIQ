package alnak.dto;

public class PriceImportResponse {
    private int marketsProcessed;
    private int totalEntries;
    private int deduplicatedEntries;
    private int importedEntries;
    private int skippedEntries;
    private int invalidEntries;

    public PriceImportResponse() {
    }

    public PriceImportResponse(
            int marketsProcessed,
            int totalEntries,
            int deduplicatedEntries,
            int importedEntries,
            int skippedEntries,
            int invalidEntries
    ) {
        this.marketsProcessed = marketsProcessed;
        this.totalEntries = totalEntries;
        this.deduplicatedEntries = deduplicatedEntries;
        this.importedEntries = importedEntries;
        this.skippedEntries = skippedEntries;
        this.invalidEntries = invalidEntries;
    }

    public int getMarketsProcessed() {
        return marketsProcessed;
    }

    public void setMarketsProcessed(int marketsProcessed) {
        this.marketsProcessed = marketsProcessed;
    }

    public int getTotalEntries() {
        return totalEntries;
    }

    public void setTotalEntries(int totalEntries) {
        this.totalEntries = totalEntries;
    }

    public int getDeduplicatedEntries() {
        return deduplicatedEntries;
    }

    public void setDeduplicatedEntries(int deduplicatedEntries) {
        this.deduplicatedEntries = deduplicatedEntries;
    }

    public int getImportedEntries() {
        return importedEntries;
    }

    public void setImportedEntries(int importedEntries) {
        this.importedEntries = importedEntries;
    }

    public int getSkippedEntries() {
        return skippedEntries;
    }

    public void setSkippedEntries(int skippedEntries) {
        this.skippedEntries = skippedEntries;
    }

    public int getInvalidEntries() {
        return invalidEntries;
    }

    public void setInvalidEntries(int invalidEntries) {
        this.invalidEntries = invalidEntries;
    }
}
