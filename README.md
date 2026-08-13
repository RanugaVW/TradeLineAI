# TradeLine AI 🚀

TradeLine AI is an advanced, AI-powered Cryptocurrency Web Portal and Market Advisor designed for professional and aspiring traders. It is mainly built to provide robust **risk management** tools for beginner, intermediate, and professional traders. It features real-time Support & Resistance detection, AI-driven trade signals, paper trading capabilities, and comprehensive market analytics. Furthermore, the system acts as a supplementary tool to help you gain **confirmations on your own research** and confidently identify current market trends.

---

## 🌟 Key Features

* **🤖 AI Market Advisor & Trade Signals:** Integrated with advanced AI models (like Gemini) to provide actionable trade setups, risk analysis, and market direction predictions.
* **📈 Auto-Support & Resistance (S/R) Engine:** Automatically detects and validates structural support and resistance zones using a strict 3+ bounce rule.
* **💹 Live Demo Trading (Paper Trading):** Practice strategies in real-time market conditions without financial risk.
* **🧠 Smart Money Concepts (SMC):** Advanced market structure analysis integrated directly into the charting experience.
* **💸 Budget Optimization:** AI-assisted position sizing and risk management recommendations.
* **⏱️ Automated Alerts & Backtesting:** Background market polling for AI alerts and a built-in backtester to validate historical strategies.
* **🔐 Secure Authentication:** Powered by Supabase for robust user management and data security.

---

## 🛠️ Tech Stack

**Frontend (Core UI & Logic)**
* **HTML5 / CSS3 / Vanilla JS** - Lightweight, blazing-fast performance.
* **Vite** - Next-generation frontend tooling for rapid development.
* **Lightweight Charts (`lightweight-charts`)** - High-performance financial charting library by TradingView.
* **HTML2Canvas** - For capturing chart screenshots and sharing setups.

**Backend & Infrastructure**
* **Supabase** - Open-source Firebase alternative handling PostgreSQL database, Authentication, and Edge Functions.
* **OpenRouter / Gemini AI API** - Powering the AI Market Advisor and NLP-based market insights.

**Testing**
* **Vitest** - Blazing fast unit test framework powered by Vite.

---

## 📂 Folder Structure

```text
TradeLineAI/
├── api/                  # Backend API integrations (e.g., gemini.js for AI routing)
├── public/               # Static assets (images, icons, etc.)
├── src/                  # Main Application Source Code
│   ├── analysis/         # Core trading algorithms and S/R logic
│   ├── components/       # Reusable UI components
│   ├── styles/           # CSS stylesheets (main.css, demoTrading.css)
│   ├── tests/            # Application test files
│   ├── main.js           # Primary entry point for the frontend application
│   └── neuro-bg.js       # Dynamic canvas background animations
├── supabase/             # Supabase configuration and edge functions
├── tests/                # End-to-end and integration tests
├── .env                  # Environment variables
├── index.html            # Main HTML template
├── package.json          # Project dependencies and scripts
├── schema.sql            # Database schema for Supabase PostgreSQL
└── vite.config.js        # Vite configuration
```

---

## 🚀 Getting Started

### Prerequisites
* Node.js (v18 or higher)
* NPM or Yarn
* A Supabase Project
* OpenRouter / Gemini API Keys

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/RanugaVW/TradeLineAI.git
   cd TradeLineAI
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   Create a `.env` file in the root directory and add your keys:
   ```env
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   VITE_AI_API_KEY=your_ai_api_key
   ```

4. **Start the development server:**
   ```bash
   npm run dev
   ```

5. **Build for production:**
   ```bash
   npm run build
   ```

---

## ⚠️ Disclaimer

**TradeLine AI is for informational and educational purposes only.** It does not constitute financial, investment, or trading advice. Cryptocurrencies are highly volatile, and you should always conduct your own research before making financial decisions. The developers are not responsible for any financial losses incurred while using this platform.
