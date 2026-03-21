import { Connection, Keypair, PublicKey, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import fetch from "node-fetch";
import * as dotenv from "dotenv";

dotenv.config();

// ── Configuration ────────────────────────────────────────────────────────────

const RPC_URL = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const TRIGGER_DELTA = parseFloat(process.env.TRIGGER_DELTA || "0.05"); // 5% price move
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || "30000", 10); // 30 s
const SWAP_AMOUNT_SOL = parseFloat(process.env.SWAP_AMOUNT_SOL || "0.01"); // SOL per swap
const SLIPPAGE_BPS = parseInt(process.env.SLIPPAGE_BPS || "50", 10); // 0.5%

// Token mint addresses
const SOL_MINT = "So11111111111111111111111111111111111111112";
const HYPE_MINT = process.env.HYPE_MINT || ""; // Set HYPE token mint in .env

const JUPITER_QUOTE_API = "https://quote-api.jup.ag/v6/quote";
const JUPITER_SWAP_API = "https://quote-api.jup.ag/v6/swap";

// ── Helpers ──────────────────────────────────────────────────────────────────

function loadKeypair(privateKeyBase58: string): Keypair {
  const secretKey = bs58.decode(privateKeyBase58);
  return Keypair.fromSecretKey(secretKey);
}

async function getHypePrice(): Promise<number> {
  if (!HYPE_MINT) throw new Error("HYPE_MINT environment variable is not set");

  // Use Jupiter price API to get HYPE price in USD
  const url = `https://price.jup.ag/v6/price?ids=${HYPE_MINT}&vsToken=USDC`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Price API error: ${res.status} ${res.statusText}`);

  const json = (await res.json()) as { data: Record<string, { price: number }> };
  const priceData = json.data[HYPE_MINT];
  if (!priceData) throw new Error(`No price data returned for HYPE mint: ${HYPE_MINT}`);

  return priceData.price;
}

async function getJupiterQuote(
  inputMint: string,
  outputMint: string,
  amountLamports: number
): Promise<unknown> {
  const params = new URLSearchParams({
    inputMint,
    outputMint,
    amount: amountLamports.toString(),
    slippageBps: SLIPPAGE_BPS.toString(),
  });

  const res = await fetch(`${JUPITER_QUOTE_API}?${params}`);
  if (!res.ok) throw new Error(`Quote API error: ${res.status} ${res.statusText}`);
  return res.json();
}

async function executeSwap(
  connection: Connection,
  wallet: Keypair,
  quoteResponse: unknown
): Promise<string> {
  const swapRes = await fetch(JUPITER_SWAP_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quoteResponse,
      userPublicKey: wallet.publicKey.toString(),
      wrapAndUnwrapSol: true,
    }),
  });

  if (!swapRes.ok) {
    throw new Error(`Swap API error: ${swapRes.status} ${swapRes.statusText}`);
  }

  const { swapTransaction } = (await swapRes.json()) as { swapTransaction: string };

  // Deserialise, sign, and send
  const txBuf = Buffer.from(swapTransaction, "base64");
  const tx = VersionedTransaction.deserialize(txBuf);
  tx.sign([wallet]);

  const sig = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });

  await connection.confirmTransaction(sig, "confirmed");
  return sig;
}

// ── Main loop ────────────────────────────────────────────────────────────────

async function main() {
  if (!PRIVATE_KEY) {
    throw new Error("PRIVATE_KEY environment variable is not set");
  }
  if (!HYPE_MINT) {
    throw new Error("HYPE_MINT environment variable is not set");
  }

  const connection = new Connection(RPC_URL, "confirmed");
  const wallet = loadKeypair(PRIVATE_KEY);

  console.log(`SOLbot started`);
  console.log(`Wallet : ${wallet.publicKey.toString()}`);
  console.log(`RPC    : ${RPC_URL}`);
  console.log(`HYPE   : ${HYPE_MINT}`);
  console.log(`Delta  : ${(TRIGGER_DELTA * 100).toFixed(1)}%`);
  console.log(`Amount : ${SWAP_AMOUNT_SOL} SOL per swap`);
  console.log(`Poll   : every ${POLL_INTERVAL_MS / 1000}s\n`);

  let lastPrice: number | null = null;

  while (true) {
    try {
      const price = await getHypePrice();
      const timestamp = new Date().toISOString();

      if (lastPrice === null) {
        console.log(`[${timestamp}] Initial HYPE price: $${price.toFixed(6)}`);
        lastPrice = price;
      } else {
        const delta = (price - lastPrice) / lastPrice;
        const deltaStr = `${(delta * 100).toFixed(2)}%`;
        console.log(`[${timestamp}] HYPE price: $${price.toFixed(6)} (Δ ${deltaStr})`);

        if (Math.abs(delta) >= TRIGGER_DELTA) {
          const direction = delta > 0 ? "BUY" : "SELL";
          console.log(`[${timestamp}] Trigger hit (${deltaStr}) → ${direction}`);

          const amountLamports = Math.round(SWAP_AMOUNT_SOL * 1e9);

          // BUY HYPE with SOL when price rises; SELL HYPE for SOL when price drops
          const inputMint = direction === "BUY" ? SOL_MINT : HYPE_MINT;
          const outputMint = direction === "BUY" ? HYPE_MINT : SOL_MINT;

          try {
            const quote = await getJupiterQuote(inputMint, outputMint, amountLamports);
            const sig = await executeSwap(connection, wallet, quote);
            console.log(`[${timestamp}] Swap executed ✓  tx: ${sig}`);
            lastPrice = price; // reset baseline after a trade
          } catch (swapErr) {
            console.error(`[${timestamp}] Swap failed:`, swapErr);
          }
        }
      }
    } catch (err) {
      console.error(`[${new Date().toISOString()}] Error fetching price:`, err);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
