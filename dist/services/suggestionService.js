"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.readExcel = readExcel;
exports.seedSearchSuggestions = seedSearchSuggestions;
exports.exportSuggestionsForOpenSearch = exportSuggestionsForOpenSearch;
exports.pushSuggestionorCategoriesToOpenSearch = pushSuggestionorCategoriesToOpenSearch;
exports.exportCatalogForOpenSearch = exportCatalogForOpenSearch;
const xlsx_1 = __importDefault(require("xlsx"));
const axios_1 = __importDefault(require("axios"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../config/database"));
const opensearch_1 = require("@opensearch-project/opensearch");
const url = (process.env.OPEN_SEARCH_URL || "http://localhost:9200").trim();
const client = new opensearch_1.Client({
    node: url,
    auth: {
        username: process.env.OPEN_SEARCH_USERNAME || "admin",
        password: process.env.OPEN_SEARCH_PASSWORD || "password",
    },
});
async function readExcel(filePathOrUrl) {
    let workbook;
    if (filePathOrUrl?.startsWith("http")) {
        const response = await axios_1.default.get(filePathOrUrl, {
            responseType: "arraybuffer",
        });
        workbook = xlsx_1.default.read(response.data, { type: "buffer" });
    }
    else if (filePathOrUrl) {
        workbook = xlsx_1.default.readFile(filePathOrUrl);
    }
    else {
        throw new Error("No valid file path or URL provided for Excel file.");
    }
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const result = [];
    let row = 2;
    while (true) {
        const cell = sheet[`A${row}`];
        if (!cell)
            break;
        const value = cell.v?.toString().trim();
        if (value)
            result.push(value);
        row++;
    }
    return result;
}
async function seedSearchSuggestions(terms) {
    console.log(`Inserting ${terms.length} search terms...`);
    await database_1.default.query(`TRUNCATE TABLE search_suggestions`);
    for (let i = 0; i < terms.length; i += 1000) {
        const chunk = terms.slice(i, i + 1000);
        const selects = chunk.map(() => "SELECT ? AS name").join(" UNION ALL ");
        const sql = `
      INSERT INTO search_suggestions (name)
      SELECT v.name
      FROM (${selects}) AS v
      WHERE NOT EXISTS (SELECT 1 FROM search_suggestions s WHERE s.name = v.name)
    `;
        await database_1.default.query(sql, {
            replacements: chunk,
            type: sequelize_1.QueryTypes.INSERT,
        });
    }
}
async function exportSuggestionsForOpenSearch(outputPath) {
    const dir = path_1.default.dirname(outputPath);
    if (!fs_1.default.existsSync(dir))
        fs_1.default.mkdirSync(dir, { recursive: true });
    const suggestions = await database_1.default.query("SELECT id, type, name FROM search_suggestions", { type: sequelize_1.QueryTypes.SELECT });
    const lines = [];
    suggestions.forEach((s) => {
        lines.push(JSON.stringify({
            index: {
                _index: process.env.OPEN_SEARCH_SUGGESTION_INDEX || "test_suggestions",
                _id: `kw_${s.id}`,
            },
        }));
        lines.push(JSON.stringify({ type: s.type, id: s.id, name: s.name }));
    });
    fs_1.default.writeFileSync(outputPath, lines.join("\n") + "\n");
    return suggestions.length;
}
async function pushSuggestionorCategoriesToOpenSearch(filePath) {
    const bulkData = fs_1.default.readFileSync(filePath, "utf-8");
    console.log("Bulk data read from file, preparing to send to OpenSearch...");
    const response = await client.bulk({ body: bulkData });
    return response.body;
}
async function exportCatalogForOpenSearch(outputPath) {
    const dir = path_1.default.dirname(outputPath);
    if (!fs_1.default.existsSync(dir))
        fs_1.default.mkdirSync(dir, { recursive: true });
    const lines = [];
    const categoryDocs = [];
    const productDocs = [];
    const categories = await database_1.default.query(`SELECT id, name, parent_id, image, slug, icon_image, featured, position
     FROM categories
     ORDER BY parent_id, position`, { type: sequelize_1.QueryTypes.SELECT });
    const mapByParent = {};
    categories.forEach((cat) => {
        if (!mapByParent[cat.parent_id])
            mapByParent[cat.parent_id] = [];
        mapByParent[cat.parent_id].push(cat);
    });
    function addCategory(cat) {
        let type;
        switch (cat.position) {
            case 0:
                type = "category";
                break;
            case 1:
                type = "subcategory";
                break;
            case 2:
                type = "subsubcategory";
                break;
            default:
                type = "subcategory";
        }
        categoryDocs.push({
            id: cat.id,
            index: {
                index: {
                    _index: process.env.OPEN_SEARCH_CATEGORIES_INDEX || "dev-catalog-index",
                    _id: `cat_${cat.id}`,
                },
            },
            source: {
                type,
                id: cat.id.toString(),
                name: cat.name,
                parent_id: cat.parent_id.toString(),
                image: cat.image || "def.png",
            },
        });
        if (mapByParent[cat.id]) {
            mapByParent[cat.id].forEach(addCategory);
        }
    }
    if (mapByParent[0]) {
        mapByParent[0].forEach(addCategory);
    }
    const items = await database_1.default.query(`SELECT  i.id, i.name, i.image, i.price, i.discount, i.discount_type,
            i.status, i.avg_rating, i.rating_count, i.slug, i.is_approved, 
            i.try_and_buy, i.gender, i.age_group, i.category_id, i.variations,i.category_ids,
            c1.name AS category_name,
            c2.name AS subcategory_name,
            c3.name AS subsubcategory_name
     FROM items i
     LEFT JOIN categories c1 ON c1.id = i.category_id AND c1.position = 0
     LEFT JOIN categories c2 ON c2.id = i.category_id AND c2.position = 1
     LEFT JOIN categories c3 ON c3.id = i.category_id AND c3.position = 2`, { type: sequelize_1.QueryTypes.SELECT });
    const categoriesMap = {};
    categories.forEach((c) => (categoriesMap[c.id] = c));
    items.forEach((item) => {
        const { category_name, subcategory_name, subsubcategory_name } = resolveCategoryChain(item.category_id, categoriesMap);
        const sale_price = applyDiscount({
            price: item.price,
            discount: item.discount,
            discount_type: item.discount_type,
        }).sale_price;
        productDocs.push({
            id: item.id,
            index: {
                index: {
                    _index: process.env.OPEN_SEARCH_CATEGORIES_INDEX || "dev-catalog-index",
                    _id: `prod_${item.id}`,
                },
            },
            source: {
                type: "product",
                id: item.id.toString(),
                name: item.name,
                image: item.image || "def.png",
                price: item.price.toString(),
                discount: item.discount.toString(),
                discount_type: item.discount_type,
                status: item.status.toString(),
                avg_rating: item.avg_rating?.toString() || "0.00000000000000",
                rating_count: item.rating_count?.toString() || "0",
                slug: item.slug,
                is_approved: item.is_approved?.toString() || "1",
                try_and_buy: item.try_and_buy?.toString() || "0",
                gender: item.gender || "unisex",
                age_group: item.age_group,
                category_id: item.category_id?.toString(),
                category_name,
                subcategory_name,
                subsubcategory_name,
                variations: item.variations || [],
                sale_price: sale_price.toString(),
            },
        });
    });
    categoryDocs.sort((a, b) => a.id - b.id);
    productDocs.sort((a, b) => a.id - b.id);
    [...categoryDocs, ...productDocs].forEach((d) => {
        if (typeof d.source.age_group === "string") {
            try {
                d.source.age_group = JSON.parse(d.source.age_group);
            }
            catch {
                d.source.age_group = [d.source.age_group];
            }
        }
        lines.push(JSON.stringify(d.index));
        lines.push(JSON.stringify(d.source));
    });
    fs_1.default.writeFileSync(outputPath, lines.join("\n") + "\n");
    console.log(` OpenSearch bulk JSON exported: ${categories.length} categories, ${items.length} products.`);
    return lines.length / 2;
}
function resolveCategoryChain(catId, categoriesMap) {
    let category_name = null;
    let subcategory_name = null;
    let subsubcategory_name = null;
    let current = categoriesMap[catId];
    if (!current)
        return { category_name, subcategory_name, subsubcategory_name };
    if (current.position === 0) {
        category_name = current.name;
    }
    else if (current.position === 1) {
        subcategory_name = current.name;
        if (categoriesMap[current.parent_id]) {
            category_name = categoriesMap[current.parent_id].name;
        }
    }
    else if (current.position === 2) {
        subsubcategory_name = current.name;
        if (categoriesMap[current.parent_id]) {
            subcategory_name = categoriesMap[current.parent_id].name;
            if (categoriesMap[categoriesMap[current.parent_id].parent_id]) {
                category_name =
                    categoriesMap[categoriesMap[current.parent_id].parent_id].name;
            }
        }
    }
    return { category_name, subcategory_name, subsubcategory_name };
}
function applyDiscount(data) {
    const price = Number(data.price) || 0;
    const discount = Number(data.discount) || 0;
    let salePrice = price;
    if (data.discount_type === "percent") {
        salePrice -= (salePrice * discount) / 100;
    }
    else if (data.discount_type === "amount") {
        salePrice -= discount;
    }
    data.sale_price = Math.round(Math.max(salePrice, 0) * 100) / 100;
    return data;
}
const data = { price: "100", discount_type: "percent", discount: "12.5" };
console.log(applyDiscount(data));
