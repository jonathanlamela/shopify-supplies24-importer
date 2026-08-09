import type { LoaderFunctionArgs } from "react-router";

import { authenticate } from "../shopify.server";
import {
  searchTaxonomyCategories,
  type GraphqlLike,
} from "../.server/supplies24/shopify";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim();

  if (!query) {
    return new Response(
      JSON.stringify({ categories: [] }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  const categories = await searchTaxonomyCategories(
    admin as unknown as GraphqlLike,
    query,
  );

  return new Response(JSON.stringify({ categories }), {
    headers: { "Content-Type": "application/json" },
  });
};
