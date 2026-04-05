class StockTicker extends HTMLElement {
  static get observedAttributes() {
    return ["symbol", "market", "weeks", "logo", "stockgraphcolor", "apikey"];
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._resizeObserver = null;
  }

  connectedCallback() {
    this.renderShell();
    this.load();
    this.observeResize();
  }

  disconnectedCallback() {
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
  }

  attributeChangedCallback() {
    if (this.isConnected) this.load();
  }

  get props() {
    return {
      symbol: (this.getAttribute("symbol") || "").trim(),
      market: (this.getAttribute("market") || "").trim().toUpperCase(),
      weeks: Math.min(parseInt(this.getAttribute("weeks") || "2", 10) || 2, 104),
      logo: (this.getAttribute("logo") || "").trim(),
      stockgraphcolor: (this.getAttribute("stockgraphcolor") || "").trim(),
      apikey: (this.getAttribute("apikey") || "").trim()
    };
  }

  get polygonApiKey() {
    const fromAttr = this.props.apikey;
    const fromGlobal = window.POLYGON_API_KEY || "";
    if (!fromAttr && !fromGlobal) {
      throw new Error("Missing Polygon API key. Set apikey attribute or window.POLYGON_API_KEY.");
    }
    return fromAttr || fromGlobal;
  }

  renderShell() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          width: 100%;
          box-sizing: border-box;
          font-family: Inter, Arial, sans-serif;
          color: #222;
        }

        .wrap {
          padding: 1rem 0.5rem 0.5rem;
          width: 100%;
          box-sizing: border-box;
          min-height: 80px;
        }

        .row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .left {
          display: flex;
          align-items: center;
          gap: 1rem;
          min-width: 0;
          flex: 1;
        }

        .logo {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 50px;
          height: 50px;
          border-radius: 50%;
          overflow: hidden;
          background: #efefef;
          flex-shrink: 0;
        }

        .logo img {
          max-width: 70%;
          max-height: 70%;
          display: block;
        }

        .text {
          min-width: 0;
          flex: 1;
        }

        h2 {
          margin: 0;
          font-size: 1rem;
          line-height: 1.3;
          font-weight: 600;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        p {
          margin: 0;
          line-height: 1.3;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: #555;
          font-size: 0.9rem;
        }

        .right {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-shrink: 0;
        }

        .price {
          text-align: right;
          line-height: 1.3;
        }

        .current {
          font-size: 1rem;
          font-weight: 600;
          color: #222;
        }

        .delta {
          font-size: 0.85rem;
        }

        .loading, .error {
          margin-top: 0.5rem;
          font-size: 0.85rem;
          color: #666;
        }

        svg {
          display: block;
        }
      </style>

      <div class="wrap">
        <div class="row">
          <div class="left">
            <div class="logo" id="logoBox"></div>
            <div class="text">
              <h2 id="symbolText">—</h2>
              <p id="nameText"></p>
            </div>
          </div>

          <div class="right">
            <svg id="chart" width="120" height="40" viewBox="0 0 130 40" aria-hidden="true"></svg>
            <div class="price">
              <div class="current" id="priceText"></div>
              <div class="delta" id="deltaText"></div>
            </div>
          </div>
        </div>

        <div class="loading" id="statusText"></div>
      </div>
    `;
  }

  observeResize() {
    const wrap = this.shadowRoot.querySelector(".wrap");
    if (!wrap) return;

    this._resizeObserver = new ResizeObserver(() => {
      this.updateResponsiveSizing();
    });

    this._resizeObserver.observe(wrap);
    this.updateResponsiveSizing();
  }

  updateResponsiveSizing() {
    const wrap = this.shadowRoot.querySelector(".wrap");
    const width = wrap?.getBoundingClientRect().width || 0;

    const small = width < 295;
    const medium = width < 350;

    const fontSize = small ? "0.7rem" : medium ? "0.85rem" : "1rem";
    const subSize = small ? "0.6rem" : medium ? "0.8rem" : "0.9rem";
    const logoSize = small ? 30 : medium ? 35 : 50;
    const chartWidth = small ? 70 : medium ? 90 : 120;
    const chartHeight = small || medium ? 30 : 40;

    this.shadowRoot.querySelector(".logo").style.width = `${logoSize}px`;
    this.shadowRoot.querySelector(".logo").style.height = `${logoSize}px`;
    this.shadowRoot.querySelector("h2").style.fontSize = fontSize;
    this.shadowRoot.querySelector("#nameText").style.fontSize = fontSize;
    this.shadowRoot.querySelector("#priceText").style.fontSize = fontSize;
    this.shadowRoot.querySelector("#deltaText").style.fontSize = subSize;

    const chart = this.shadowRoot.querySelector("#chart");
    chart.setAttribute("width", chartWidth);
    chart.setAttribute("height", chartHeight);
  }

  normalizeTicker(symbol, market) {
    const raw = symbol.trim().toUpperCase();
    if (!raw) return "";

    if (
      raw.startsWith("XASX:") ||
      raw.startsWith("XNYS:") ||
      raw.startsWith("XNAS:")
    ) {
      return raw;
    }

    if (raw.includes(":")) {
      return raw;
    }

    switch (market) {
      case "ASX":
        return `XASX:${raw}`;
      case "NASDAQ":
      case "XNAS":
        return `XNAS:${raw}`;
      case "NYSE":
      case "XNYS":
        return `XNYS:${raw}`;
      default:
        return raw;
    }
  }

  async fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} for ${url}`);
    }
    return await res.json();
  }

  buildLogoDataUrl(svgText) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
  }

  makeChartPath(values) {
    if (!Array.isArray(values) || values.length < 2) return "";

    const min = Math.min(...values);
    const range = Math.max(...values) - min || 1;
    const stepX = 120 / (values.length - 1);

    const points = values.map((v, i) => ({
      x: i * stepX,
      y: 40 - ((v - min) / range) * 40
    }));

    let d = `M ${points[0].x},${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const curr = points[i];
      const next = points[i + 1];
      const midX = (curr.x + next.x) / 2;
      d += ` C ${midX},${curr.y} ${midX},${next.y} ${next.x},${next.y}`;
    }
    return d;
  }

  setStatus(text) {
    this.shadowRoot.querySelector("#statusText").textContent = text || "";
  }

  setError(text) {
    this.setStatus(text);
  }

  renderData({ displaySymbol, name, logoUrl, closes, currentPrice, previousPrice, graphColor }) {
    const logoBox = this.shadowRoot.querySelector("#logoBox");
    const symbolText = this.shadowRoot.querySelector("#symbolText");
    const nameText = this.shadowRoot.querySelector("#nameText");
    const priceText = this.shadowRoot.querySelector("#priceText");
    const deltaText = this.shadowRoot.querySelector("#deltaText");
    const chart = this.shadowRoot.querySelector("#chart");

    symbolText.textContent = displaySymbol || "—";
    nameText.textContent = name || "";

    logoBox.innerHTML = logoUrl
      ? `<img src="${logoUrl}" alt="${name || displaySymbol} logo">`
      : "";

    priceText.textContent =
      typeof currentPrice === "number" ? `$${currentPrice.toFixed(2)}` : "";

    if (typeof currentPrice === "number" && typeof previousPrice === "number") {
      const delta = currentPrice - previousPrice;
      const up = delta >= 0;
      deltaText.textContent = `${up ? "+" : "-"}$${Math.abs(delta).toFixed(2)}`;
      deltaText.style.color = up ? "green" : "red";
    } else {
      deltaText.textContent = "";
    }

    const path = this.makeChartPath(closes);
    chart.innerHTML = path
      ? `<path d="${path}" stroke="${graphColor}" stroke-width="2" fill="none"></path>`
      : "";
  }

  async load() {
    const { symbol, market, weeks, logo, stockgraphcolor } = this.props;
    if (!symbol) {
      this.setError("Missing symbol.");
      return;
    }

    const graphColor = stockgraphcolor || "#008000";
    const displaySymbol = market ? `${symbol.toUpperCase()} (${market})` : symbol.toUpperCase();

    this.setStatus("Loading data...");

    try {
      const apiKey = this.polygonApiKey;
      const normalizedTicker = this.normalizeTicker(symbol, market);

      const referenceUrl =
        `https://api.polygon.io/v3/reference/tickers/${encodeURIComponent(normalizedTicker)}?apiKey=${encodeURIComponent(apiKey)}`;

      const referenceData = await this.fetchJson(referenceUrl);

      const today = new Date();
      const from = new Date(today);
      from.setDate(today.getDate() - (7 * weeks));

      const toDate = today.toISOString().split("T")[0];
      const fromDate = from.toISOString().split("T")[0];

      const aggsUrl =
        `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(normalizedTicker)}` +
        `/range/1/day/${fromDate}/${toDate}?adjusted=true&sort=asc&apiKey=${encodeURIComponent(apiKey)}`;

      const aggsData = await this.fetchJson(aggsUrl);

      if (!aggsData?.results?.length) {
        throw new Error("No price history returned.");
      }

      const closes = aggsData.results.map((row) => row.c);
      const currentPrice = closes[closes.length - 1];
      const previousPrice = closes.length > 1 ? closes[closes.length - 2] : null;

      let logoUrl = logo || "";
      if (!logoUrl && referenceData?.results?.branding?.logo_url) {
        try {
          const logoFetchUrl =
            `${referenceData.results.branding.logo_url}?apiKey=${encodeURIComponent(apiKey)}`;
          const logoRes = await fetch(logoFetchUrl);
          if (logoRes.ok) {
            const svgText = await logoRes.text();
            logoUrl = this.buildLogoDataUrl(svgText);
          }
        } catch {
          // ignore logo fetch failure
        }
      }

      this.renderData({
        displaySymbol,
        name: referenceData?.results?.name || normalizedTicker,
        logoUrl,
        closes,
        currentPrice,
        previousPrice,
        graphColor
      });

      this.setStatus("");
    } catch (err) {
      console.error("Stock widget load error:", err);
      this.setError(`Unable to load stock data for ${displaySymbol}.`);
      this.renderData({
        displaySymbol,
        name: "",
        logoUrl: logo || "",
        closes: [],
        currentPrice: null,
        previousPrice: null,
        graphColor
      });
    }
  }
}

customElements.define("stock-ticker", StockTicker);
