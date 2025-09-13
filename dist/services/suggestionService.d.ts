export declare function readExcel(filePathOrUrl?: string): Promise<string[]>;
export declare function seedSearchSuggestions(terms: string[]): Promise<void>;
export declare function exportSuggestionsForOpenSearch(outputPath: string): Promise<number>;
export declare function pushSuggestionorCategoriesToOpenSearch(filePath: string): Promise<import("@opensearch-project/opensearch/api/index.js").Bulk_ResponseBody>;
export declare function exportCatalogForOpenSearch(outputPath: string): Promise<number>;
