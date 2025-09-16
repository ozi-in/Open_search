import xlsx from "xlsx";
import axios from "axios";
import fs from "fs";
import path from "path";
import { QueryTypes } from "sequelize";
import sequelize from "../config/database";
import { Client } from "@opensearch-project/opensearch";

const url = (process.env.OPEN_SEARCH_URL || "http://localhost:9200").trim();

const client = new Client({
  node: url,
  auth: {
    username: process.env.OPEN_SEARCH_USERNAME || "admin",
    password: process.env.OPEN_SEARCH_PASSWORD || "password",
  },
});

export async function readExcel(filePathOrUrl?: string) {
  let workbook: any;

  if (filePathOrUrl?.startsWith("http")) {
    const response = await axios.get(filePathOrUrl, {
      responseType: "arraybuffer",
    });
    workbook = xlsx.read(response.data, { type: "buffer" });
  } else if (filePathOrUrl) {
    workbook = xlsx.readFile(filePathOrUrl);
  } else {
    throw new Error("No valid file path or URL provided for Excel file.");
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const result: string[] = [];

  let row = 2;
  while (true) {
    const cell = sheet[`A${row}`];
    if (!cell) break;
    const value = cell.v?.toString().trim();
    if (value) result.push(value);
    row++;
  }

  return result;
}

export async function seedSearchSuggestions(terms: string[]) {
  console.log(`Inserting ${terms.length} search terms...`);
  await sequelize.query(`TRUNCATE TABLE search_suggestions`);

  for (let i = 0; i < terms.length; i += 1000) {
    const chunk = terms.slice(i, i + 1000);
    const selects = chunk.map(() => "SELECT ? AS name").join(" UNION ALL ");
    const sql = `
      INSERT INTO search_suggestions (name)
      SELECT v.name
      FROM (${selects}) AS v
      WHERE NOT EXISTS (SELECT 1 FROM search_suggestions s WHERE s.name = v.name)
    `;
    await sequelize.query(sql, {
      replacements: chunk,
      type: QueryTypes.INSERT,
    });
  }
}

export async function exportSuggestionsForOpenSearch(outputPath: string) {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const suggestions: any[] = await sequelize.query(
    "SELECT id, type, name FROM search_suggestions",
    { type: QueryTypes.SELECT }
  );

  const lines: string[] = [];
  suggestions.forEach((s) => {
    lines.push(
      JSON.stringify({
        index: {
          _index:
            process.env.OPEN_SEARCH_SUGGESTION_INDEX || "test_suggestions",
          _id: `kw_${s.id}`,
        },
      })
    );
    lines.push(JSON.stringify({ type: s.type, id: s.id, name: s.name }));
  });

  fs.writeFileSync(outputPath, lines.join("\n") + "\n");
  return suggestions.length;
}

export async function pushSuggestionorCategoriesToOpenSearch(filePath: string) {
  const bulkData: any = fs.readFileSync(filePath, "utf-8");
  console.log("Bulk data read from file, preparing to send to OpenSearch...");

  const response = await client.bulk({ body: bulkData });
  return response.body;
}

export async function exportCatalogForOpenSearch(outputPath: string) {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const lines: string[] = [];
  const categoryDocs: { id: number; index: any; source: any }[] = [];
  const productDocs: { id: number; index: any; source: any }[] = [];

  const categories: any[] = await sequelize.query(
    `SELECT id, name, parent_id, image, slug, icon_image, featured, position
     FROM categories
     ORDER BY parent_id, position`,
    { type: QueryTypes.SELECT }
  );

  const mapByParent: Record<number, any[]> = {};
  categories.forEach((cat) => {
    if (!mapByParent[cat.parent_id]) mapByParent[cat.parent_id] = [];
    mapByParent[cat.parent_id].push(cat);
  });

  function addCategory(cat: any) {
    let type: string;
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
          _index:
            process.env.OPEN_SEARCH_CATEGORIES_INDEX || "dev-catalog-index",
          _id: `cat_${cat.id}`,
        },
      },
      source: {
        type,
        id: cat.id.toString(),
        name: cat.name,
        parent_id: cat.parent_id.toString(),
        image: cat.image || "def.png",
        // slug: cat.slug || null,
        // icon_image: cat.icon_image || null,
        // featured: !!cat.featured,
      },
    });

    if (mapByParent[cat.id]) {
      mapByParent[cat.id].forEach(addCategory);
    }
  }

  if (mapByParent[0]) {
    mapByParent[0].forEach(addCategory);
  }

  const items: any[] = await sequelize.query(
    `SELECT  i.id, i.name, i.image, i.price, i.discount, i.discount_type,
            i.status, i.avg_rating, i.rating_count, i.slug, i.is_approved, 
            i.try_and_buy, i.gender, i.age_group, i.category_id, i.variations,i.category_ids,
            c1.name AS category_name,
            c2.name AS subcategory_name,
            c3.name AS subsubcategory_name
     FROM items i
     LEFT JOIN categories c1 ON c1.id = i.category_id AND c1.position = 0
     LEFT JOIN categories c2 ON c2.id = i.category_id AND c2.position = 1
     LEFT JOIN categories c3 ON c3.id = i.category_id AND c3.position = 2`,
    { type: QueryTypes.SELECT }
  );

  const categoriesMap: Record<number, any> = {};
  categories.forEach((c) => (categoriesMap[c.id] = c));

  items.forEach((item) => {
    const { category_name, subcategory_name, subsubcategory_name } =
      resolveCategoryChain(item.category_id, categoriesMap);
    const sale_price = applyDiscount({
      price: item.price,
      discount: item.discount,
      discount_type: item.discount_type,
    }).sale_price;
    productDocs.push({
      id: item.id,
      index: {
        index: {
          _index:
            process.env.OPEN_SEARCH_CATEGORIES_INDEX || "dev-catalog-index",
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
      } catch {
        d.source.age_group = [d.source.age_group];
      }
    }
    lines.push(JSON.stringify(d.index));
    lines.push(JSON.stringify(d.source));
  });

  fs.writeFileSync(outputPath, lines.join("\n") + "\n");

  console.log(
    ` OpenSearch bulk JSON exported: ${categories.length} categories, ${items.length} products.`
  );
  return lines.length / 2;
}

function resolveCategoryChain(
  catId: number,
  categoriesMap: Record<number, any>
) {
  let category_name: string | null = null;
  let subcategory_name: string | null = null;
  let subsubcategory_name: string | null = null;

  let current = categoriesMap[catId];

  if (!current) return { category_name, subcategory_name, subsubcategory_name };

  if (current.position === 0) {
    category_name = current.name;
  } else if (current.position === 1) {
    subcategory_name = current.name;
    if (categoriesMap[current.parent_id]) {
      category_name = categoriesMap[current.parent_id].name;
    }
  } else if (current.position === 2) {
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
  // ensure numeric values
  const price = Number(data.price) || 0;
  const discount = Number(data.discount) || 0;

  let salePrice = price;

  if (data.discount_type === "percent") {
    salePrice -= (salePrice * discount) / 100;
  } else if (data.discount_type === "amount") {
    salePrice -= discount;
  }

  data.sale_price = Math.round(Math.max(salePrice, 0) * 100) / 100;

  return data;
}

// example
const data = { price: "100", discount_type: "percent", discount: "12.5" };
console.log(applyDiscount(data)); // { price: '100', discount_type: 'percent', discount: '12.5', sale_price: 87.5 }

export async function getCatalogDataForOpenSearch() {
  const lines: string[] = [];
  const categoryDocs: { id: number; index: any; source: any }[] = [];
  const productDocs: { id: number; index: any; source: any }[] = [];

  const categories: any[] = await sequelize.query(
    `SELECT id, name, parent_id, image, slug, icon_image, featured, position
     FROM categories
     ORDER BY parent_id, position`,
    { type: QueryTypes.SELECT }
  );

  const mapByParent: Record<number, any[]> = {};
  categories.forEach((cat) => {
    if (!mapByParent[cat.parent_id]) mapByParent[cat.parent_id] = [];
    mapByParent[cat.parent_id].push(cat);
  });

  function addCategory(cat: any) {
    let type: string;
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
          _index:
            process.env.OPEN_SEARCH_CATEGORIES_INDEX || "dev-catalog-index",
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

  const items: any[] = await sequelize.query(
    `SELECT  i.id, i.name, i.image, i.price, i.discount, i.discount_type,
            i.status, i.avg_rating, i.rating_count, i.slug, i.is_approved, 
            i.try_and_buy, i.gender, i.age_group, i.category_id, i.variations,i.category_ids,
            c1.name AS category_name,
            c2.name AS subcategory_name,
            c3.name AS subsubcategory_name
     FROM items i
     LEFT JOIN categories c1 ON c1.id = i.category_id AND c1.position = 0
     LEFT JOIN categories c2 ON c2.id = i.category_id AND c2.position = 1
     LEFT JOIN categories c3 ON c3.id = i.category_id AND c3.position = 2`,
    { type: QueryTypes.SELECT }
  );

  const categoriesMap: Record<number, any> = {};
  categories.forEach((c) => (categoriesMap[c.id] = c));

  items.forEach((item) => {
    const { category_name, subcategory_name, subsubcategory_name } =
      resolveCategoryChain(item.category_id, categoriesMap);
    const sale_price = applyDiscount({
      price: item.price,
      discount: item.discount,
      discount_type: item.discount_type,
    }).sale_price;
    productDocs.push({
      id: item.id,
      index: {
        index: {
          _index:
            process.env.OPEN_SEARCH_CATEGORIES_INDEX || "dev-catalog-index",
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
      } catch {
        d.source.age_group = [d.source.age_group];
      }
    }
    lines.push(JSON.stringify(d.index));
    lines.push(JSON.stringify(d.source));
  });

  console.log(
    `OpenSearch bulk JSON prepared: ${categories.length} categories, ${items.length} products.`
  );

  return {
    bulkData: lines.join("\n") + "\n",
    categoryCount: categories.length,
    productCount: items.length,
    totalCount: lines.length / 2
  };
}

export async function deleteOpenSearchIndex() {
  try {
    const indexName = process.env.OPEN_SEARCH_CATEGORIES_INDEX || "dev-catalog-index";
    console.log(`Deleting OpenSearch index: ${indexName}`);

    const response = await client.indices.delete({
      index: indexName
    });

    console.log("Index deleted successfully:", response.body);
    return {
      success: true,
      response: response.body,
      indexName
    };
  } catch (error: any) {
    // If index doesn't exist, that's okay - we can continue
    if (error.statusCode === 404) {
      console.log("Index doesn't exist, continuing with data push...");
      return {
        success: true,
        response: { acknowledged: true, message: "Index did not exist" },
        indexName: process.env.OPEN_SEARCH_CATEGORIES_INDEX || "dev-catalog-index"
      };
    }
    console.error("Error deleting OpenSearch index:", error);
    throw error;
  }
}

export async function pushCatalogDataToOpenSearch() {
  try {
    // First delete the existing index
    const deleteResult = await deleteOpenSearchIndex();
    console.log("Delete operation result:", deleteResult);

    // Get the formatted data
    const { bulkData, categoryCount, productCount, totalCount } = await getCatalogDataForOpenSearch();

    console.log("Pushing catalog data directly to OpenSearch...");

    // Push directly to OpenSearch
    const response = await client.bulk({ body: bulkData as any });

    return {
      success: true,
      deleteResult,
      response: response.body,
      categoryCount,
      productCount,
      totalCount
    };
  } catch (error) {
    console.error("Error pushing catalog data to OpenSearch:", error);
    throw error;
  }
}
