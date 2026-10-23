import { RPL_NAMESPACE, parseRpl } from "../../scripts/lib/rpl-parser.mjs";

// The parser's JSDoc types `products` as AsyncGenerator<object>; these are the records it actually yields
// (the registry_* column shapes, see productRecord() in scripts/lib/rpl-parser.mjs).
export interface PackageUnit {
  count: string | null;
  kind: string | null;
  capacity: string | null;
  capacity_unit: string | null;
  info: string | null;
}

export interface Substance {
  position: number;
  name: string;
  amount: string | null;
  unit: string | null;
  preparation_amount: string | null;
  preparation_unit: string | null;
  other_description: string | null;
}

export interface RegistryPackage {
  id: string;
  gtin: string | null;
  availability_category: string | null;
  units: PackageUnit[];
}

export interface Product {
  id: string;
  name: string;
  common_name: string | null;
  previous_name: string | null;
  strength: string | null;
  pharmaceutical_form: string | null;
  marketing_authorization_holder: string | null;
  procedure_type: string | null;
  authorization_number: string | null;
  authorization_validity: string | null;
  atc_codes: string[];
  routes: string[];
  leaflet_url: string | null;
  characteristic_url: string | null;
  substances: Substance[];
  packages: RegistryPackage[];
}

export interface ParsedRegistry {
  snapshotDate: string;
  products: Product[];
  stats: { skippedProducts: number; skippedPackages: number };
}

// The text as the stream of chunks the parser reads: one chunk, or pieces of `chunkSize` characters.
function toChunks(text: string, chunkSize?: number): AsyncIterable<string> {
  const chunks: string[] = [];
  if (!chunkSize) chunks.push(text);
  else for (let start = 0; start < text.length; start += chunkSize) chunks.push(text.slice(start, start + chunkSize));
  return {
    [Symbol.asyncIterator]() {
      let next = 0;
      return {
        next: () =>
          Promise.resolve(
            next < chunks.length
              ? { done: false as const, value: chunks[next++] ?? "" }
              : { done: true as const, value: undefined },
          ),
      };
    },
  };
}

/**
 * Runs the parser over `xml` (cut into chunks of `chunkSize` characters when given) and collects every product.
 * Parse errors surface as a rejection whether the parser throws in `parseRpl` (the first chunks) or while
 * `products` is iterated, so a test can expect a rejection without knowing where the error appears.
 */
export async function parseText(xml: string, chunkSize?: number): Promise<ParsedRegistry> {
  const { snapshotDate, products, stats } = await parseRpl(toChunks(xml, chunkSize));
  const collected: Product[] = [];
  for await (const product of products) collected.push(product as Product);
  return { snapshotDate, products: collected, stats: { ...stats } };
}

/**
 * Wraps `body` in a root element with the valid RPL namespace and a snapshot date, so a test case contains only
 * what makes it different. `date: null` omits `stanNaDzien`.
 */
export function xmlDoc(
  body: string,
  { date = "2026-10-21", namespace = RPL_NAMESPACE }: { date?: string | null; namespace?: string } = {},
): string {
  const dateAttribute = date === null ? "" : ` stanNaDzien="${date}"`;
  return `<produktyLecznicze${dateAttribute} xmlns="${namespace}">${body}</produktyLecznicze>`;
}
