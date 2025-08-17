import fs from 'fs'
import { parseGermanReceipt } from '../app/api/analyze/ocrParser.js'

// Real raw OCR text from frontend (user-provided)
const sample = `REWE
Glashüttenstr. 7
93055 Regensburg
UID Nr. : DE812706034
SUESSKARTOFFEL
1, 238 kg x
3, 79 EUR/kg
RISPENTOMATE
0, 714 kg x
2, 49 EUR/kg
BANANE CHIQUITA
0, 958 kg x
1,59 EUR/kg
BANANE CHIQUITA
1, 168 kg x
1,59 EUR/kg
SUPPENFLEISCH MK
Handeingabe E-Bon
0, 790 kg
SW-FILET
Handeingabe E-Bon
0, 540 kg
HACKFLEISCH GEM
1HAL MORTADE CAS Bon
0, 522 kg
SALAMI
Hande ingabe Tosk
E-Bon
0, 202 kg
PIK.
KRUSTENBRATEN
Hande ingabe E-Bon
0, 150 kg
DOMSCHINKEN
Handeingabe E-Bon
0, 148 kg
BAUCHSP. PANCETTA
MINISALAMI
OLD AMSTERDAM
PAST. FILAT. ALPIJ
GEFLUEGELROLLE
2 Stk x
1,09
DONUT EINZELN
U. PURES KAROTTE
BIO MAISWAFFEL
ORANGEN RIESEN
BLUTORANGE BIO
LIMETTE
ERDBEERE
TRAUBE KERNL. HEL
2 Stk x
1,29
PAKCHOI MINI
STAUDENSEL. BIO
ROMARISPENTOM.
PAPRIKA MI. BIO
ZUCCHINI BIO
SPEISEQUARK MAG.
2 Stk x
0.75
JA! SCHLAGSAHNE
2 Stk x
0, 63
MILCHSCHNITTE
POPCORN MAIS
ACETO BALSAMICO
BALSAMICO CREME
NUSS COCKTAIL
LEIBN. BUTTERK.
TOERTCHEN KAKAO
2 Stk x
1, 99
GOOGLEPLAY25
V231
6338719635590701
EUR
4,69 A
1, 78 B
1,52 B
1,86 B
6, 71 B
4,27 B
2, 55 B
3, 21 B
2: 38
2, 35 B
52
99
2, 18
0,
89
1,99
1,
99
1, 89
1,79
1, 50 B
1, 26 B
1, 79
1, 29
1,79 B
3, 19 B
0, 99 B
3, 98
25, 00 C *
SUMME
Geg. EC-Cash
EUR
EUR
* * Kundenbeleg
Datum:
Uhrzeit:
130, 18
130, 18
* *
24.
03. 2021
19:32:34
Uhr
7636`

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
