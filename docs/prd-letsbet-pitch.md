# Letsbet - Product Requirements Document

> **Telegram-native prediction markets for communities**

---

## Executive Summary

**Letsbet** is a Telegram bot that enables any community to create and trade prediction markets on any topic. Users bet with crypto (USDC on Solana), prices adjust automatically via AMM, and outcomes are resolved by community consensus.

**Target:** Crypto-native Telegram communities wanting to engage members with predictions and friendly wagering.

---

## Problem

Communities discuss predictions constantly ("Will ETH hit $5k?", "Will our token moon?") but have no simple way to put skin in the game. Existing prediction markets (Polymarket, Kalshi) are external apps requiring separate accounts, KYC, and context switching.

---

## Solution

A Telegram bot that brings prediction markets directly into group chats:
- **Create** markets in 3 taps via DM wizard
- **Trade** with inline buttons - no app switching
- **Settle** via creator resolution + community dispute mechanism

---

## User Experience Flow

### Registration (Private DM)
```
User → /start → Welcome + Wallet Setup → /deposit → Receive funds
```

### Create Market (Group → DM → Group)
```
Group: /create
Bot: "Check your DMs!"
DM: "What's your prediction?" → "Confirm" → Market posted to group
```

### Trading (Group + DM)
```
Group: User clicks [Buy YES]
DM: [5 USDC] [10 USDC] [25 USDC] → User taps amount
Group: "@alice bought YES | YES: 65% → 67%"
```

### Market Card
```
┌─────────────────────────────────────────┐
│ 🎲 Will BTC hit $100k by March?         │
│                                          │
│ ✅ YES: 65%    ❌ NO: 35%                │
│ 📊 Volume: $1,920 USDC                   │
│                                          │
│ [Buy YES] [Buy NO] [📈 Details]         │
└─────────────────────────────────────────┘
```

---

## Context Separation

| Private Chat | Group Chat |
|--------------|------------|
| Registration | Create markets |
| Deposit/Withdraw | Trade (buy/sell) |
| View portfolio | View markets |
| Resolve markets | Dispute outcomes |

**Why:** Keeps sensitive wallet operations private, trading social and engaging.

---

## Core Features (MVP)

### 1. Custodial Wallet
- Deposit SOL/USDC to bot-managed wallet
- Instant on-chain withdrawals
- Real-time balance tracking

### 2. LMSR Pricing Engine
- Logarithmic Market Scoring Rule (like Polymarket)
- Dynamic pricing: more buys → higher price
- Always-available liquidity (no order books)
- 2% trading fee

### 3. Binary Markets
- Yes/No outcome questions
- Custom outcome labels ("Win/Lose", "Moon/Dump")
- Group-exclusive markets

### 4. Resolution + Disputes
- Creator resolves outcome
- 24-hour dispute window
- Stake-weighted community voting
- Auto-payout to winners

---

## Technical Architecture

```
┌─────────────────────────────────────┐
│         Telegram Bot (grammY)       │
└─────────────┬───────────────────────┘
              │
┌─────────────▼───────────────────────┐
│         Node.js Backend             │
│  • LMSR Engine (off-chain)          │
│  • Wallet Service (custodial)       │
│  • Resolution Service               │
└─────────────┬───────────────────────┘
              │
┌─────────────▼───────────────────────┐
│  PostgreSQL + Redis                 │
└─────────────┬───────────────────────┘
              │
┌─────────────▼───────────────────────┐
│  Solana (deposit/withdraw only)     │
└─────────────────────────────────────┘
```

**Why off-chain:**
- Zero gas fees for trading
- Instant execution
- Easy to iterate pricing parameters
- Sufficient trust for MVP scale (<100 users)

---

## Business Model

| Revenue Source | Amount |
|----------------|--------|
| Trading fee | 2% per trade |
| LMSR spread | Platform takes residual |
| Premium features (future) | TBD |

---

## Key Metrics

| Metric | Target |
|--------|--------|
| User adoption | 50+ users month 1 |
| Markets created | 10+ per week |
| Avg market volume | >$100 USDC |
| Dispute resolution | <48 hours |

---

## Competitive Advantages

1. **Native experience** - No app switching, works in existing groups
2. **Zero friction** - Trade in 2 taps via inline buttons
3. **Community-first** - Group-exclusive markets foster engagement
4. **Crypto-native** - USDC settlement, familiar to target users
5. **Fair resolution** - Dispute mechanism prevents creator fraud

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Creator fraud | 24h dispute window + stake-weighted voting |
| Wallet security | Rate limiting, cold storage for reserves |
| Regulatory | ToS, geo-blocking, no fiat on-ramp |
| Low liquidity | Virtual liquidity, small initial markets |

---

## Roadmap

### Phase 1: MVP (Current)
- Binary markets
- LMSR pricing
- Creator resolution + disputes
- USDC on Solana

### Phase 2: Growth
- Multi-outcome markets
- Leaderboards
- Referral rewards
- Market categories

### Phase 3: Scale
- Oracle-based resolution (sports, crypto prices)
- Mini App UI
- Multi-chain support
- On-chain settlement option

---

## Why Now?

1. **Telegram is THE crypto hub** - 950M MAU, dominant in crypto discussions
2. **Prediction markets are mainstream** - Polymarket proved the model during 2024 election
3. **Community engagement is hard** - Projects need tools beyond announcements
4. **Crypto UX is improving** - Users ready for more than just swaps

---

## Team Ask

- **Dev resources:** 1 fullstack engineer, 2-3 weeks to MVP
- **Initial capital:** $5k for liquidity seeding
- **Distribution:** Access to 2-3 active Telegram communities for beta

---

## Contact

[Your contact info here]
