import { Router } from "express";
import {
  readExcel,
  seedSearchSuggestions,
  exportSuggestionsForOpenSearch,
  pushSuggestionorCategoriesToOpenSearch,
  exportCatalogForOpenSearch,
} from "../services/suggestionService";

const router = Router();
router.get("/test", (req, res) => {
  res.json({ message: "Auth route test endpoint working" });
});

router.post("/seed-suggestion", async (req, res) => {
  try {
    const terms = await readExcel(process.env.SEARCH_TERMS_EXCEL);
    await seedSearchSuggestions(terms);
    res.json({ success: true, message: "Seeded successfully" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/export-suggestion", async (req, res) => {
  try {
    const filePath =
      process.env.OPEN_SEARCH_PATH || "./uploads/bulk_suggestions.json";
    const count = await exportSuggestionsForOpenSearch(filePath);
    res.json({ success: true, count, filePath });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/export-categories", async (req, res) => {
  try {
    const filePath =
      process.env.OPEN_SEARCH_CATEGORY_PATH || "./uploads/bulk_categories.json";
    const count = await exportCatalogForOpenSearch(filePath);
    res.json({ success: true, count, filePath });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/push-suggestion", async (req, res) => {
  try {
    const filePath =
      process.env.OPEN_SEARCH_PATH || "./uploads/bulk_suggestions.json";
    const response = await pushSuggestionorCategoriesToOpenSearch(filePath);
    res.json({ success: true, response });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/push-categories", async (req, res) => {
  try {
    const filePath =
      process.env.OPEN_SEARCH_CATEGORIES_PATH ||
      "./uploads/bulk_categories.json";
    const response = await pushSuggestionorCategoriesToOpenSearch(filePath);
    res.json({ success: true, response });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
export default router;
