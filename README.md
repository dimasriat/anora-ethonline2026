# Anora

Anora connects warehouse-receipt owners with institutional capital through
private verification and permissioned tranches.

In Indonesia, Anora works with the
[Warehouse Receipt System (Sistem Resi Gudang, or SRG)](https://en.antaranews.com/news/273924/warehouse-receipt-system-empowers-farmers-trade-ministry).
It helps commodity owners finance stored goods without selling early, while
investors take only the risk their mandates allow.

Built for ETHOnline 2026, Classic / From Scratch track.

## Why Anora

Commodity owners often need capital before their goods are sold. Without formal
financing, they may have to sell early through
[informal middlemen (*tengkulak*)](https://www.thejakartapost.com/longform/2020/08/13/a-land-without-farmers-indonesias-agricultural-conundrum),
reducing their ability to negotiate a fair price.

Warehouse receipts make stored commodities usable as collateral. Yet financing
remains difficult because the evidence is fragmented and each participant must
verify the same facility separately.

Anora brings the process into one traceable workflow. Private records can be
verified without being disclosed, and permissioned tranches let investors take
exposure that fits their mandates. This helps attract suitable capital while
the commodity owner retains control over when the goods are sold.

The shared financing record also makes oversight more efficient for regulated
participants and
[Bappebti, Indonesia's Commodity Futures Trading Regulatory Agency](https://ojk.go.id/en/berita-dan-kegiatan/siaran-pers/Pages/Bappebti-Transfers-Regulation-and-Supervision-Duties-on-Digital-Financial-Assets-Crypto-Assets-and-Derivatives-to-OJK-BI.aspx).
Anora supports the existing SRG framework; it does not replace its registry or
legal processes.

## How it works

1. **Select** — The commodity owner chooses a warehouse receipt to finance.
2. **Verify** — Anora proves that the receipt meets the facility's requirements
   without publishing the underlying records.
3. **Structure** — The facility is divided into permissioned tranches with
   different levels of risk.
4. **Fund** — Eligible investors subscribe to a tranche that fits their mandate.
   The commodity owner receives capital without selling the goods early.
5. **Settle** — Repayment follows the facility terms and is recorded in a shared
   audit trail.

Anora does not replace the warehouse, the official registry, or the legal
security interest. It provides a verifiable financing layer around them.

## Design process

The [Anora design process and tools](https://www.figma.com/board/He6V3rae674n4I8J1yJpmA/Anora-Design-Process-and-Tools?node-id=0-1&t=IBzqKLMS2LnwF2S4-1)
documents how the product flow and interface evolved. AI-assisted tools were
used to explore and compare early directions, while FigJam and Figma were used
to map the system, evaluate the alternatives, and refine the final design
before implementation.

## Status

Under construction during ETHOnline 2026 (September 4–13). This README describes
what the project is, not what is finished. Every component is labelled live,
testnet, simulated, or planned as it lands — see `docs/STATUS.md` once the first
integrations are in.

## Run the local demo

```bash
bun install
bun run demo:api
bun run dev:web -- --port 3334
```

Open `http://127.0.0.1:3334/`. The demo API runs the complete role workflow
without Hedera or identity credentials. The normal `start` and `dev:api`
commands continue to use the repository's configured adapters.

## Team

1. **Panata Gama** — product direction, UX/UI design, frontend experience,
   structured finance, and evidence boundaries
2. **Dimas Riatmodjo** — protocol architecture, backend, smart contracts,
   zero-knowledge circuits, and integrations

## Licence

MIT. See `LICENSE`.
