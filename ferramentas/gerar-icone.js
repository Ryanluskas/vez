import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/*
  Gera o Vez.ico a partir da marca — os três traços da fila, o de cima em jade.

  Escrito à mão porque um .ico de 32x32 é só um cabeçalho e um bitmap de
  cabeça pra baixo, e não vale puxar uma dependência de imagem pra isso.
*/

const LADO = 32;
const RAIO = 6;

const TINTA = [0x14, 0x11, 0x0e];
const BARRAS = [
  { y: 9, x: 8, largura: 16, cor: [0x1f, 0xa1, 0x73] }, // jade — o próximo da fila
  { y: 15, x: 8, largura: 11, cor: [0x6f, 0x67, 0x5e] },
  { y: 21, x: 8, largura: 7, cor: [0x46, 0x3f, 0x38] },
];
const ALTURA_DA_BARRA = 3;

/* Canto arredondado: pixel fora do raio vira transparente. */
function dentroDoCanto(x, y) {
  const dx = x < RAIO ? RAIO - x : x >= LADO - RAIO ? x - (LADO - RAIO - 1) : 0;
  const dy = y < RAIO ? RAIO - y : y >= LADO - RAIO ? y - (LADO - RAIO - 1) : 0;
  if (!dx || !dy) return true;
  return dx * dx + dy * dy <= RAIO * RAIO;
}

function corDoPixel(x, y) {
  if (!dentroDoCanto(x, y)) return null;
  for (const b of BARRAS) {
    if (y >= b.y && y < b.y + ALTURA_DA_BARRA && x >= b.x && x < b.x + b.largura) {
      return b.cor;
    }
  }
  return TINTA;
}

// BGRA, de baixo pra cima — é assim que o formato espera.
const pixels = Buffer.alloc(LADO * LADO * 4);
for (let y = 0; y < LADO; y++) {
  for (let x = 0; x < LADO; x++) {
    const cor = corDoPixel(x, y);
    const i = ((LADO - 1 - y) * LADO + x) * 4;
    if (!cor) continue; // transparente
    pixels[i] = cor[2];
    pixels[i + 1] = cor[1];
    pixels[i + 2] = cor[0];
    pixels[i + 3] = 0xff;
  }
}

const mascara = Buffer.alloc((LADO / 8) * LADO); // tudo opaco

const cabecalhoDoBitmap = Buffer.alloc(40);
cabecalhoDoBitmap.writeUInt32LE(40, 0);
cabecalhoDoBitmap.writeInt32LE(LADO, 4);
cabecalhoDoBitmap.writeInt32LE(LADO * 2, 8); // XOR + AND
cabecalhoDoBitmap.writeUInt16LE(1, 12);
cabecalhoDoBitmap.writeUInt16LE(32, 14);
cabecalhoDoBitmap.writeUInt32LE(pixels.length + mascara.length, 20);

const imagem = Buffer.concat([cabecalhoDoBitmap, pixels, mascara]);

const diretorio = Buffer.alloc(6);
diretorio.writeUInt16LE(0, 0);
diretorio.writeUInt16LE(1, 2);
diretorio.writeUInt16LE(1, 4);

const entrada = Buffer.alloc(16);
entrada[0] = LADO;
entrada[1] = LADO;
entrada.writeUInt16LE(1, 4);
entrada.writeUInt16LE(32, 6);
entrada.writeUInt32LE(imagem.length, 8);
entrada.writeUInt32LE(22, 12);

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destino = path.join(raiz, "ferramentas", "Vez.ico");
fs.writeFileSync(destino, Buffer.concat([diretorio, entrada, imagem]));

console.log(`Ícone gerado: ${destino}`);
