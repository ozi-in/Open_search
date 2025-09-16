import { Client } from '@opensearch-project/opensearch';
import pkg from 'sequelize';
const { Sequelize, QueryTypes } = pkg;

// OpenSearch client configuration
const opensearchClient = new Client({
  node: process.env.OPEN_SEARCH_URL || 'https://search-search-service-7pfvpbbo5iqm7i5rxct2dzszce.aos.ap-south-1.on.aws',
  auth: {
    username: process.env.OPEN_SEARCH_USERNAME || 'admin',
    password: process.env.OPEN_SEARCH_PASSWORD || 'S@HutT80YB@6',
  },
});

// Database connection
const sequelize = new Sequelize(
  process.env.DB_NAME || 'ozi_products',
  process.env.DB_USER || 'admin',
  process.env.DB_PASSWORD || 'rLfcu9Y80S8X',
  {
    host: process.env.DB_HOST || 'ozi-production-db.cz82wy66qdwe.ap-south-1.rds.amazonaws.com',
    dialect: 'mysql',
    logging: false,
    pool: {
      max: 5,
      min: 0,
      acquire: 60000,
      idle: 10000
    },
    retry: {
      max: 3
    },
    dialectOptions: {
      connectTimeout: 20000
    }
  }
);

// Helper function to apply discount
function applyDiscount(data) {
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

// Helper function to resolve category chain
function resolveCategoryChain(catId, categoriesMap) {
  let category_name = null;
  let subcategory_name = null;
  let subsubcategory_name = null;

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
        category_name = categoriesMap[categoriesMap[current.parent_id].parent_id].name;
      }
    }
  }

  return { category_name, subcategory_name, subsubcategory_name };
}

// Function to delete OpenSearch index
async function deleteOpenSearchIndex() {
  try {
    const indexName = process.env.OPEN_SEARCH_CATEGORIES_INDEX || 'prod-catalog-index';
    console.log(`Deleting OpenSearch index: ${indexName}`);
    
    const response = await opensearchClient.indices.delete({
      index: indexName
    });
    
    console.log('Index deleted successfully:', response.body);
    return {
      success: true,
      response: response.body,
      indexName
    };
  } catch (error) {
    // If index doesn't exist, that's okay - we can continue
    if (error.statusCode === 404) {
      console.log('Index doesn\'t exist, continuing with data push...');
      return {
        success: true,
        response: { acknowledged: true, message: 'Index did not exist' },
        indexName: process.env.OPEN_SEARCH_CATEGORIES_INDEX || 'prod-catalog-index'
      };
    }
    console.error('Error deleting OpenSearch index:', error);
    throw error;
  }
}

// Function to get catalog data for OpenSearch
async function getCatalogDataForOpenSearch() {
  const lines = [];
  const categoryDocs = [];
  const productDocs = [];

  // Fetch categories
  const categories = await sequelize.query(
    `SELECT id, name, parent_id, image, slug, icon_image, featured, position
     FROM categories
     ORDER BY parent_id, position`,
    { type: QueryTypes.SELECT }
  );

  const mapByParent = {};
  categories.forEach((cat) => {
    if (!mapByParent[cat.parent_id]) mapByParent[cat.parent_id] = [];
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
          _index: process.env.OPEN_SEARCH_CATEGORIES_INDEX || 'prod-catalog-index',
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

  // Fetch products
  const items = await sequelize.query(
    `SELECT  i.id, i.name, i.image, i.price, i.discount, i.discount_type,
            i.status, i.avg_rating, i.rating_count, i.slug, i.is_approved, 
            i.try_and_buy, i.gender, i.age_group, i.category_id, i.variations, i.category_ids,
            c1.name AS category_name,
            c2.name AS subcategory_name,
            c3.name AS subsubcategory_name
     FROM items i
     LEFT JOIN categories c1 ON c1.id = i.category_id AND c1.position = 0
     LEFT JOIN categories c2 ON c2.id = i.category_id AND c2.position = 1
     LEFT JOIN categories c3 ON c3.id = i.category_id AND c3.position = 2`,
    { type: QueryTypes.SELECT }
  );

  const categoriesMap = {};
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
          _index: process.env.OPEN_SEARCH_CATEGORIES_INDEX || 'prod-catalog-index',
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

// Main function to push catalog data to OpenSearch
async function pushCatalogDataToOpenSearch() {
  try {
    // First delete the existing index
    const deleteResult = await deleteOpenSearchIndex();
    console.log('Delete operation result:', deleteResult);
    
    // Get the formatted data
    const { bulkData, categoryCount, productCount, totalCount } = await getCatalogDataForOpenSearch();
    
    console.log('Pushing catalog data directly to OpenSearch...');
    
    // Push directly to OpenSearch
    const response = await opensearchClient.bulk({ body: bulkData });
    
    return {
      success: true,
      deleteResult,
      response: response.body,
      categoryCount,
      productCount,
      totalCount
    };
  } catch (error) {
    console.error('Error pushing catalog data to OpenSearch:', error);
    throw error;
  }
}

// Lambda handler
export const handler = async (event) => {
  console.log('Starting push-categories-direct Lambda function...');
  console.log('Event:', JSON.stringify(event, null, 2));
  
  try {
    // Test database connection
    await sequelize.authenticate();
    console.log('Database connection established successfully.');
    
    // Execute the main function
    const result = await pushCatalogDataToOpenSearch();
    
    console.log('Operation completed successfully:', result);
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        categoryCount: result.categoryCount,
        productCount: result.productCount,
        totalCount: result.totalCount,
        deleteResult: result.deleteResult,
        pushResponse: result.response,
        message: "Index deleted and data pushed directly to OpenSearch without creating file",
        timestamp: new Date().toISOString()
      })
    };
  } catch (error) {
    console.error('Error in Lambda function:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      })
    };
  } finally {
    // Close database connection
    await sequelize.close();
  }
};
