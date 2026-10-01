// Streaming parser for the RPL (Rejestr Produktów Leczniczych) XML export v6.0.0.
// Turns a text stream into human product records shaped like the registry_* table columns,
// without building the whole document tree in memory. Entities are decoded by saxes.

import { SaxesParser } from "saxes";

export const RPL_NAMESPACE = "http://rejestry.ezdrowie.gov.pl/rpl/eksport-danych-v6.0.0";

export class RplParseError extends Error {}

// Empty XML strings are stored as NULL.
function value(attributes, name) {
  const raw = attributes[name]?.value;
  return raw === undefined || raw === "" ? null : raw;
}

function bigintId(attributes, element) {
  const id = attributes.id?.value ?? "";
  if (!/^\d{1,19}$/.test(id)) throw new RplParseError(`<${element}> has an invalid id "${id}"`);
  return id;
}

function productRecord(attributes) {
  const previousName = value(attributes, "nazwaPoprzedniaProduktu");
  return {
    id: bigintId(attributes, "produktLeczniczy"),
    name: value(attributes, "nazwaProduktu"),
    common_name: value(attributes, "nazwaPowszechnieStosowana"),
    previous_name: previousName?.trim().toLowerCase() === "brak" ? null : previousName,
    strength: value(attributes, "moc"),
    pharmaceutical_form: value(attributes, "nazwaPostaciFarmaceutycznej"),
    marketing_authorization_holder: value(attributes, "podmiotOdpowiedzialny"),
    procedure_type: value(attributes, "typProcedury"),
    authorization_number: value(attributes, "numerPozwolenia"),
    authorization_validity: value(attributes, "waznoscPozwolenia"),
    atc_codes: [],
    routes: [],
    // Parallel imports carry the leaflet only in ulotkaImportRownolegly.
    leaflet_url: value(attributes, "ulotka") ?? value(attributes, "ulotkaImportRownolegly"),
    characteristic_url: value(attributes, "charakterystyka"),
    substances: [],
    packages: [],
  };
}

/**
 * Parses an RPL export.
 * @param {AsyncIterable<string>} source text chunks (already decoded from UTF-8)
 * @returns {Promise<{ snapshotDate: string, products: AsyncGenerator<object>, stats: { skippedProducts: number, skippedPackages: number } }>}
 *   `products` yields human products only; `stats` is complete once `products` is exhausted.
 *   Throws RplParseError on a wrong root namespace, a missing stanNaDzien, malformed or truncated XML.
 */
export async function parseRpl(source) {
  const parser = new SaxesParser({ xmlns: true });
  const iterator = source[Symbol.asyncIterator]();
  const queue = [];
  const stats = { skippedProducts: 0, skippedPackages: 0 };
  let snapshotDate = null;
  let product = null; // current human product; null outside a product or inside a skipped one
  let pkg = null; // current active package; null when skipped
  let atcText = null; // collected text while inside <kodATC>
  let first = true;

  parser.on("opentag", (node) => {
    const a = node.attributes;
    if (node.local === "produktyLecznicze" && snapshotDate === null) {
      if (node.uri !== RPL_NAMESPACE) {
        throw new RplParseError(`unexpected root namespace "${node.uri}", expected "${RPL_NAMESPACE}"`);
      }
      const date = a.stanNaDzien?.value ?? "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new RplParseError(`missing or invalid stanNaDzien "${date}"`);
      snapshotDate = date;
      return;
    }
    if (snapshotDate === null) throw new RplParseError(`unexpected root element <${node.name}>`);
    switch (node.local) {
      case "produktLeczniczy":
        if (a.rodzajPreparatu?.value === "ludzki") product = productRecord(a);
        else {
          product = null;
          stats.skippedProducts++;
        }
        break;
      case "kodATC":
        if (product) atcText = "";
        break;
      case "drogaPodania": {
        const route = product && value(a, "drogaPodaniaNazwa");
        if (route) product.routes.push(route);
        break;
      }
      case "substancjaCzynna":
        if (product) {
          const name = value(a, "nazwaSubstancji");
          if (name === null)
            throw new RplParseError(`product ${product.id} has a substance with an empty nazwaSubstancji`);
          product.substances.push({
            position: product.substances.length + 1,
            name,
            amount: value(a, "iloscSubstancji"),
            unit: value(a, "jednostkaMiaryIlosciSubstancji"),
            preparation_amount: value(a, "iloscPreparatu"),
            preparation_unit: value(a, "jednostkaMiaryIlosciPreparatu"),
            other_description: value(a, "innyOpisIlosci"),
          });
        }
        break;
      case "opakowanie":
        pkg = null;
        if (!product) break;
        // Missing attribute or "NIE" means an active package.
        if (a.skasowane?.value === "TAK") stats.skippedPackages++;
        else {
          pkg = {
            id: bigintId(a, "opakowanie"),
            gtin: value(a, "kodGTIN"),
            availability_category: value(a, "kategoriaDostepnosci"),
            units: [],
          };
        }
        break;
      case "jednostkaOpakowania":
        if (pkg) {
          pkg.units.push({
            count: value(a, "liczbaOpakowan"),
            kind: value(a, "rodzajOpakowania"),
            capacity: value(a, "pojemnosc"),
            capacity_unit: value(a, "jednostkaPojemnosci"),
            info: value(a, "informacjeDodatkowe"),
          });
        }
        break;
    }
  });

  parser.on("text", (text) => {
    if (atcText !== null) atcText += text;
  });
  parser.on("cdata", (text) => {
    if (atcText !== null) atcText += text;
  });

  parser.on("closetag", (node) => {
    switch (node.local) {
      case "kodATC":
        if (product && atcText !== null && atcText.trim()) product.atc_codes.push(atcText.trim());
        atcText = null;
        break;
      case "opakowanie":
        if (product && pkg) product.packages.push(pkg);
        pkg = null;
        break;
      case "produktLeczniczy":
        if (product) {
          if (product.name === null) throw new RplParseError(`product ${product.id} has an empty nazwaProduktu`);
          queue.push(product);
        }
        product = null;
        break;
    }
  });

  // Feeds the next chunk; returns false at the end of the stream (after close(), which throws on truncated XML).
  async function pump() {
    const { value: chunk, done } = await iterator.next();
    if (done) {
      parser.close();
      return false;
    }
    let text = String(chunk);
    if (first) {
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
      first = false;
    }
    parser.write(text);
    return true;
  }

  let more = true;
  while (snapshotDate === null && more) more = await pump();
  if (snapshotDate === null) throw new RplParseError("no <produktyLecznicze> root element found");

  async function* products() {
    for (;;) {
      while (queue.length) yield queue.shift();
      if (!more) return;
      more = await pump();
    }
  }

  return { snapshotDate, products: products(), stats };
}
