import fs from 'fs'
import { parseGermanReceipt } from '../app/api/analyze/ocrParser.js'

// Sample cleaned OCR text approximated from the provided receipt image.
const sample = `REWE
Glashuttenstr. 7
93055 Regensburg
UID Nr.: DE812706034
SUESSKARTOFFEL 1,238 kg x 3,79 EUR/kg 4,69 A
RISPENTOMATE 0,714 kg x 2,49 EUR/kg 1,78 B
BANANE CHIQUITA 0,958 kg x 1,59 EUR/kg 1,52 B
BANANE CHIQUITA 1,168 kg x 1,59 EUR/kg 1,86 B
SUPPENFLEISCH MK 6,71 B
HAND EINGABE E-Bon
SW-FILET 0,790 kg 4,27 B
HACKFLEISCH 0,540 kg 2,55 B
ITAL.MORTAD.CAST 0,202 kg 3,21 B
SALAMI PIK.TUSK 2,59 B
KRUSTENBRATEN 0,150 kg 2,39 B
DOMSCHINKEN 0,148 kg 2,35 B
BAUCHSP.PANCETTA 4,52 B
MINISALAMI 2,99 B
OLD AMSTERDAM 3,79 B
PAST.FILAT.ALPIJ 2,18 B
GEFLUEGELROLLE 0,90 B
DONUT EINZELN 0,69 B
U. PURES KAROTTE 2,49 B
BIO MAISWAFFEL 0,99 B
ORANGEN RIESEN 2,89 B
BLUTORANGE BIO 0,99 B
LIMETTE 0,59 B
ERDBEERE 5,99 B
TRAUBE KERNL.HEL 2,58 B
PAKCHOU MINI 1,99 B
STAUDENSEL.BIO 1,99 B
ROMARIS PENTOM. 3,29 B
PAPRIKA MI. BIO 1,89 B
ZUCCHINI BIO 1,79 B
SPEISEQUARK MAG. 1,50 B
JA! SCHLAGSAHNE 1,26 B
MILCHSCHNITTE 1,79 B
POPCORN MAIS 1,29 B
ACETO BALSAMICO 3,19 B
BALSAMICO CREME 4,39 B
NUSS COCKTAIL 0,99 B
LEIBN. BUTTERK. 3,98 B
TOERTCHEN KAKAO 1,99 B
GOOGLEPLAY25 V231 25,00 C
SUMME EUR 130,18
Geg. EC-Cash EUR 130,18
Datum: 24.03.2021
Uhrzeit: 18:32:34`

const result = parseGermanReceipt(sample, { debug: true })
console.log('Items parsed:', result.items.length)
console.log(result.items.slice(0,5))
console.log('Sum:', result.sum, 'sumStr:', result.sumStr)

// compact diagnostics summary
if (result.debug && result.debug.diagnostics) {
	const diag = result.debug.diagnostics
	const cnt = diag.reduce((acc, d) => {
		acc[d.action] = (acc[d.action] || 0) + 1
		return acc
	}, {})
	console.log('Diagnostics summary:', cnt)
	fs.writeFileSync('scripts/parser-debug.json', JSON.stringify(result.debug, null, 2))
	console.log('Wrote scripts/parser-debug.json')
}

// Write final parsed output for inspection
fs.writeFileSync('scripts/parser-output.json', JSON.stringify({ items: result.items, sum: result.sum, sumStr: result.sumStr }, null, 2))
console.log('Wrote scripts/parser-output.json')
