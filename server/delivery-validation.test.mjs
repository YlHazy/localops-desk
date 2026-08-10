import assert from "node:assert/strict";
import test from "node:test";
import { inspectPetPng, scanPrivateIdentityText, validateDelivery } from "../scripts/validate-delivery.mjs";

test("repository plugin and delivery references are valid", () => {
  assert.deepEqual(validateDelivery(), { ok: true, errors: [] });
});

test("pet gate accepts only exact alpha-capable PNG metadata", () => {
  const valid = pngFixture({ width: 1536, height: 1872, colorType: 6 });
  assert.equal(inspectPetPng(valid).ok, true);

  const opaque = inspectPetPng(pngFixture({ width: 1536, height: 1872, colorType: 2 }));
  assert.equal(opaque.ok, false);
  assert.match(opaque.errors.join(" "), /no alpha/);

  const wrongSize = inspectPetPng(pngFixture({ width: 1151, height: 1367, colorType: 6 }));
  assert.equal(wrongSize.ok, false);
  assert.match(wrongSize.errors.join(" "), /expected 1536x1872/);
});

test("private identity scanner recognizes former project infrastructure without storing it as a fixture", () => {
  const formerDomain = ["https://", "ai", "2law", ".cn/health"].join("");
  const formerProject = ["lex", "hub", "-prod-01"].join("");
  assert.deepEqual(scanPrivateIdentityText(`${formerDomain} ${formerProject}`), [
    "former product project identifier",
    "former product domain",
  ]);
  assert.deepEqual(scanPrivateIdentityText("sample-service localhost"), []);
});

function pngFixture({ width, height, colorType }) {
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", Buffer.from([
      width >>> 24, width >>> 16, width >>> 8, width,
      height >>> 24, height >>> 16, height >>> 8, height,
      8, colorType, 0, 0, 0,
    ])),
    chunk("IDAT", Buffer.from([0])),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function chunk(type, payload) {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(payload.length, 0);
  header.write(type, 4, "ascii");
  return Buffer.concat([header, payload, Buffer.alloc(4)]);
}
