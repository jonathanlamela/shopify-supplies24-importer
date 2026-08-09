export interface GraphqlLike {
  graphql(
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<Response>;
}

export interface Collection {
  id: string;
  title: string;
}

export interface ProductVariant {
  id: string;
  price: string;
  sku?: string | null;
  barcode?: string | null;
  inventoryItemId?: string | null;
  inventoryItem?: { id: string } | null;
}

export interface ProductRef {
  id: string;
  title: string;
  vendor?: string | null;
  hasImage?: boolean;
  variants: ProductVariant[];
}

export async function gql<T>(
  client: GraphqlLike,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await client.graphql(
    query,
    variables ? { variables } : undefined,
  );
  const body = (await response.json()) as {
    data?: T;
    errors?: { message: string }[] | { message?: string };
  };

  if (Array.isArray(body.errors) && body.errors.length > 0) {
    throw new Error(body.errors.map((e) => e.message).join("; "));
  }
  if (!Array.isArray(body.errors) && body.errors?.message) {
    throw new Error(body.errors.message);
  }

  return body.data as T;
}

function throwUserErrors(userErrors: { field?: string[] | null; message: string }[]) {
  if (userErrors && userErrors.length > 0) {
    throw new Error(userErrors.map((e) => `${e.field ?? ""} ${e.message}`.trim()).join("; "));
  }
}

const COLLECTIONS_QUERY = `#graphql
query Collections($first: Int!, $after: String) {
  collections(first: $first, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes { id title }
  }
}`;

export async function fetchCollections(client: GraphqlLike): Promise<Collection[]> {
  const collections: Collection[] = [];
  let after: string | null = null;

  do {
    const data: {
      collections: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: Collection[];
      };
    } = await gql(client, COLLECTIONS_QUERY, { first: 250, after });

    collections.push(...data.collections.nodes);
    after = data.collections.pageInfo.hasNextPage
      ? data.collections.pageInfo.endCursor
      : null;
  } while (after);

  return collections;
}

const CREATE_COLLECTION_MUTATION = `#graphql
mutation CreateCollection($input: CollectionInput!) {
  collectionCreate(input: $input) {
    collection { id title }
    userErrors { field message }
  }
}`;

export async function createCollection(
  client: GraphqlLike,
  title: string,
): Promise<Collection> {
  const data = await gql<{
    collectionCreate: {
      collection: Collection | null;
      userErrors: { field?: string[] | null; message: string }[];
    };
  }>(client, CREATE_COLLECTION_MUTATION, { input: { title } });

  throwUserErrors(data.collectionCreate.userErrors);
  if (!data.collectionCreate.collection) {
    throw new Error("Creazione collezione fallita");
  }
  return data.collectionCreate.collection;
}

const ADD_TO_COLLECTION_MUTATION = `#graphql
mutation AddToCollection($collectionId: ID!, $productIds: [ID!]!) {
  collectionsAddProducts(collectionId: $collectionId, productIds: $productIds) {
    collection { id }
    userErrors { field message }
  }
}`;

export async function addProductsToCollection(
  client: GraphqlLike,
  collectionId: string,
  productIds: string[],
): Promise<void> {
  if (productIds.length === 0) {
    return;
  }
  const data = await gql<{
    collectionsAddProducts: {
      userErrors: { field?: string[] | null; message: string }[];
    };
  }>(client, ADD_TO_COLLECTION_MUTATION, { collectionId, productIds });
  throwUserErrors(data.collectionsAddProducts.userErrors);
}

const REMOVE_FROM_COLLECTION_MUTATION = `#graphql
mutation RemoveFromCollection($collectionId: ID!, $productIds: [ID!]!) {
  collectionsRemoveProducts(collectionId: $collectionId, productIds: $productIds) {
    userErrors { field message }
  }
}`;

export async function removeProductsFromCollection(
  client: GraphqlLike,
  collectionId: string,
  productIds: string[],
): Promise<void> {
  if (productIds.length === 0) {
    return;
  }
  const data = await gql<{
    collectionsRemoveProducts: {
      userErrors: { field?: string[] | null; message: string }[];
    };
  }>(client, REMOVE_FROM_COLLECTION_MUTATION, { collectionId, productIds });
  throwUserErrors(data.collectionsRemoveProducts.userErrors);
}

const FIND_PRODUCT_BY_BARCODE_QUERY = `#graphql
query FindProductByBarcode($query: String!) {
  products(first: 1, query: $query) {
    nodes {
      id
      title
      vendor
      media(first: 1) { nodes { id } }
      variants(first: 5) {
        nodes {
          id
          price
          sku
          barcode
          inventoryItem { id }
        }
      }
    }
  }
}`;

export async function findProductByBarcode(
  client: GraphqlLike,
  barcode: string,
): Promise<ProductRef | null> {
  if (!barcode) {
    return null;
  }
  const data = await gql<{
    products: { nodes: (Omit<ProductRef, "variants"> & {
      media: { nodes: { id: string }[] };
      variants: { nodes: ProductVariant[] };
    })[] };
  }>(client, FIND_PRODUCT_BY_BARCODE_QUERY, {
    query: `barcode:${barcode}`,
  });

  const product = data.products.nodes[0];
  if (!product) {
    return null;
  }
  return {
    ...product,
    hasImage: product.media.nodes.length > 0,
    variants: product.variants.nodes.map((v) => ({
      ...v,
      inventoryItemId: v.inventoryItemId ?? v.inventoryItem?.id ?? null,
    })),
  };
}

const CREATE_PRODUCT_MUTATION = `#graphql
mutation CreateProduct($product: ProductCreateInput!) {
  productCreate(product: $product) {
    product {
      id
      title
      vendor
      variants(first: 1) {
        nodes { id price sku barcode inventoryItem { id } }
      }
    }
    userErrors { field message }
  }
}`;

const UPDATE_VARIANTS_BULK_MUTATION = `#graphql
mutation UpdateVariantsBulk($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
  productVariantsBulkUpdate(productId: $productId, variants: $variants) {
    productVariants { id price sku barcode inventoryItem { id } }
    userErrors { field message }
  }
}`;

export interface CreateProductInput {
  title: string;
  vendor?: string;
  productType?: string;
  descriptionHtml?: string;
  tags?: string[];
  barcode?: string;
  sku?: string;
  price?: string;
  taxonomyCategoryId?: string;
}

export async function createProduct(
  client: GraphqlLike,
  input: CreateProductInput,
): Promise<ProductRef> {
  const createData = await gql<{
    productCreate: {
      product: (Omit<ProductRef, "variants"> & {
        variants: { nodes: ProductVariant[] };
      }) | null;
      userErrors: { field?: string[] | null; message: string }[];
    };
  }>(client, CREATE_PRODUCT_MUTATION, {
    product: {
      title: input.title,
      vendor: input.vendor,
      productType: input.productType,
      descriptionHtml: input.descriptionHtml,
      tags: input.tags,
      category: input.taxonomyCategoryId
        ? `gid://shopify/TaxonomyCategory/${input.taxonomyCategoryId}`
        : null,
    },
  });

  throwUserErrors(createData.productCreate.userErrors);
  if (!createData.productCreate.product) {
    throw new Error("Creazione prodotto fallita");
  }

  const created = createData.productCreate.product;
  const defaultVariantId = created.variants.nodes[0]?.id;
  if (!defaultVariantId) {
    throw new Error("Prodotto creato senza variante predefinita");
  }

  const variantData = await gql<{
    productVariantsBulkUpdate: {
      productVariants: ProductVariant[];
      userErrors: { field?: string[] | null; message: string }[];
    };
  }>(client, UPDATE_VARIANTS_BULK_MUTATION, {
    productId: created.id,
    variants: [
      {
        id: defaultVariantId,
        price: input.price,
        barcode: input.barcode,
        inventoryPolicy: "DENY",
        inventoryItem: { sku: input.sku, tracked: true },
      },
    ],
  });
  throwUserErrors(variantData.productVariantsBulkUpdate.userErrors);

  return {
    id: created.id,
    title: created.title,
    vendor: created.vendor,
    variants: variantData.productVariantsBulkUpdate.productVariants.map((v) => ({
      ...v,
      inventoryItemId: v.inventoryItemId ?? v.inventoryItem?.id ?? null,
    })),
  };
}

export async function updateVariantPrice(
  client: GraphqlLike,
  productId: string,
  variantId: string,
  price: string,
): Promise<void> {
  const data = await gql<{
    productVariantsBulkUpdate: {
      userErrors: { field?: string[] | null; message: string }[];
    };
  }>(client, UPDATE_VARIANTS_BULK_MUTATION, {
    productId,
    variants: [{ id: variantId, price }],
  });
  throwUserErrors(data.productVariantsBulkUpdate.userErrors);
}

const UPDATE_PRODUCT_CATEGORY_MUTATION = `#graphql
mutation UpdateProductCategory($product: ProductUpdateInput!) {
  productUpdate(product: $product) {
    product { id }
    userErrors { field message }
  }
}`;

/**
 * Imposta productType e/o la categoria standardizzata (tassonomia Shopify)
 * su un prodotto esistente. taxonomyCategoryId è l'id corto (es. "sg-4-17-2-17").
 */
export async function updateProductCategory(
  client: GraphqlLike,
  productId: string,
  input: { productType?: string; taxonomyCategoryId?: string },
): Promise<void> {
  const data = await gql<{
    productUpdate: {
      userErrors: { field?: string[] | null; message: string }[];
    };
  }>(client, UPDATE_PRODUCT_CATEGORY_MUTATION, {
    product: {
      id: productId,
      productType: input.productType ?? null,
      category: input.taxonomyCategoryId
        ? `gid://shopify/TaxonomyCategory/${input.taxonomyCategoryId}`
        : null,
    },
  });
  throwUserErrors(data.productUpdate.userErrors);
}

const SET_PRODUCT_IMAGE_MUTATION = `#graphql
mutation SetProductImage($identifier: ProductSetIdentifiers!, $input: ProductSetInput!) {
  productSet(identifier: $identifier, input: $input, synchronous: true) {
    product { id }
    userErrors { field message }
  }
}`;

/**
 * Associa un'immagine (da URL esterno) a un prodotto esistente, se non ne ha già una.
 */
export async function setProductImage(
  client: GraphqlLike,
  productId: string,
  imageUrl: string,
  alt: string,
): Promise<void> {
  const data = await gql<{
    productSet: {
      userErrors: { field?: string[] | null; message: string }[];
    };
  }>(client, SET_PRODUCT_IMAGE_MUTATION, {
    identifier: { id: productId },
    input: {
      files: [{ originalSource: imageUrl, alt, contentType: "IMAGE" }],
    },
  });
  throwUserErrors(data.productSet.userErrors);
}

const SEARCH_TAXONOMY_QUERY = `#graphql
query SearchTaxonomy($query: String!, $first: Int!) {
  taxonomy {
    categories(search: $query, first: $first) {
      nodes {
        id
        name
        fullName
      }
    }
  }
}`;

export interface TaxonomyCategoryRef {
  id: string;
  name: string;
  fullName: string;
}

/**
 * Cerca nella tassonomia standardizzata delle categorie prodotto di Shopify.
 * Restituisce id corti (es. "sg-4-17-2-17") pronti per productCategory.
 */
export async function searchTaxonomyCategories(
  client: GraphqlLike,
  query: string,
  first = 10,
): Promise<TaxonomyCategoryRef[]> {
  const data = await gql<{
    taxonomy: {
      categories: { nodes: { id: string; name: string; fullName: string }[] };
    };
  }>(client, SEARCH_TAXONOMY_QUERY, { query, first });
  return data.taxonomy.categories.nodes.map((node) => ({
    id: node.id.replace("gid://shopify/TaxonomyCategory/", ""),
    name: node.name,
    fullName: node.fullName,
  }));
}

const SET_INVENTORY_MUTATION = `#graphql
mutation SetInventory($input: InventorySetQuantitiesInput!, $idempotencyKey: String!) {
  inventorySetQuantities(input: $input) @idempotent(key: $idempotencyKey) {
    userErrors { field message }
  }
}`;

export async function setInventoryQuantity(
  client: GraphqlLike,
  locationId: string,
  inventoryItemId: string,
  quantity: number,
): Promise<void> {
  const data = await gql<{
    inventorySetQuantities: {
      userErrors: { field?: string[] | null; message: string }[];
    };
  }>(client, SET_INVENTORY_MUTATION, {
    input: {
      reason: "correction",
      name: "available",
      quantities: [
        { inventoryItemId, locationId, quantity, changeFromQuantity: null },
      ],
    },
    idempotencyKey: crypto.randomUUID(),
  });
  throwUserErrors(data.inventorySetQuantities.userErrors);
}

const LOCATIONS_QUERY = `#graphql
query Locations($first: Int!) {
  locations(first: $first) {
    nodes { id }
  }
}`;

export async function getFirstLocation(
  client: GraphqlLike,
): Promise<string | null> {
  const data = await gql<{ locations: { nodes: { id: string }[] } }>(
    client,
    LOCATIONS_QUERY,
    { first: 1 },
  );
  return data.locations.nodes[0]?.id ?? null;
}

export interface PublicationRef {
  id: string;
  title: string;
}

const LIST_PUBLICATIONS_QUERY = `#graphql
query ListPublications($first: Int!) {
  publications(first: $first) {
    nodes {
      id
      catalog { title }
    }
  }
}`;

/**
 * Elenca i canali di vendita (publication) disponibili sul negozio,
 * da mostrare nelle Impostazioni per la selezione dei canali di pubblicazione.
 */
export async function fetchPublications(
  client: GraphqlLike,
): Promise<PublicationRef[]> {
  const data = await gql<{
    publications: { nodes: { id: string; catalog: { title: string } | null }[] };
  }>(client, LIST_PUBLICATIONS_QUERY, { first: 50 });
  return data.publications.nodes.map((node) => ({
    id: node.id,
    title: node.catalog?.title ?? node.id,
  }));
}

const PUBLISH_PRODUCT_MUTATION = `#graphql
mutation PublishProduct($id: ID!, $input: [PublicationInput!]!) {
  publishablePublish(id: $id, input: $input) {
    userErrors { field message }
  }
}`;

/**
 * Pubblica un prodotto sui canali di vendita configurati nelle Impostazioni.
 */
export async function publishProductToChannels(
  client: GraphqlLike,
  productId: string,
  publicationIds: string[],
): Promise<void> {
  if (publicationIds.length === 0) {
    return;
  }
  const data = await gql<{
    publishablePublish: {
      userErrors: { field?: string[] | null; message: string }[];
    };
  }>(client, PUBLISH_PRODUCT_MUTATION, {
    id: productId,
    input: publicationIds.map((publicationId) => ({ publicationId })),
  });
  throwUserErrors(data.publishablePublish.userErrors);
}
