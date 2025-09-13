"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const suggestionService_1 = require("../services/suggestionService");
const router = (0, express_1.Router)();
router.get("/test", (req, res) => {
    res.json({ message: "Auth route test endpoint working" });
});
router.post("/seed-suggestion", async (req, res) => {
    try {
        const terms = await (0, suggestionService_1.readExcel)(process.env.SEARCH_TERMS_EXCEL);
        await (0, suggestionService_1.seedSearchSuggestions)(terms);
        res.json({ success: true, message: "Seeded successfully" });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.get("/export-suggestion", async (req, res) => {
    try {
        const filePath = process.env.OPEN_SEARCH_PATH || "./uploads/bulk_suggestions.json";
        const count = await (0, suggestionService_1.exportSuggestionsForOpenSearch)(filePath);
        res.json({ success: true, count, filePath });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.get("/export-categories", async (req, res) => {
    try {
        const filePath = process.env.OPEN_SEARCH_CATEGORY_PATH || "./uploads/bulk_categories.json";
        const count = await (0, suggestionService_1.exportCatalogForOpenSearch)(filePath);
        res.json({ success: true, count, filePath });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.post("/push-suggestion", async (req, res) => {
    try {
        const filePath = process.env.OPEN_SEARCH_PATH || "./uploads/bulk_suggestions.json";
        const response = await (0, suggestionService_1.pushSuggestionorCategoriesToOpenSearch)(filePath);
        res.json({ success: true, response });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.post("/push-categories", async (req, res) => {
    try {
        const filePath = process.env.OPEN_SEARCH_CATEGORIES_PATH ||
            "./uploads/bulk_categories.json";
        const response = await (0, suggestionService_1.pushSuggestionorCategoriesToOpenSearch)(filePath);
        res.json({ success: true, response });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.default = router;
