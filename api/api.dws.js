import { ethers } from "ethers";

// ----- CONFIG -----
const BASE_RPC = "https://mainnet.base.org";
const TOKEN = "0xeed0b37580fd9ee711f0a477b2be5c306b41ef12"; // Vortex
const INITIAL_TOTAL_SUPPLY_HUMAN = 10_000_000_000n; // 10B human units

// Verifiable burn sinks (expand if your token uses others)
const BURN_ADDRESSES = [
  "0x0000000000000000000000000000000000000000",
  "0x000000000000000000000000000000000000dEaD"
];

const abi = [
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)"
];

const provider = new ethers.JsonRpcProvider(BASE_RPC);
const contract = new ethers.Contract(TOKEN, abi, provider);

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, "http://localhost");
    const q = (url.searchParams.get("q") || "").toLowerCase();

    if (q !== "totalcoins" && q !== "totalsupply") {
      res.setHeader("Content-Type", "text/plain");
      res.send("NA");
      return;
    }

    // Read on-chain
    const [rawTotal, decimals] = await Promise.all([
      contract.totalSupply(),
      contract.decimals()
    ]);

    const factor = 10n ** BigInt(decimals);
    const initialRaw = INITIAL_TOTAL_SUPPLY_HUMAN * factor;

    // Sum balances at known burn addresses (raw units)
    let burnedRaw = 0n;
    if (BURN_ADDRESSES.length) {
      const bals = await Promise.all(BURN_ADDRESSES.map(a => contract.balanceOf(a)));
      burnedRaw = bals.reduce((acc, b) => acc + BigInt(b), 0n);
    }

    // Heuristic to avoid double-subtracting burns:
    // If contract already reduces totalSupply on burn, rawTotal < initialRaw.
    // Use rawTotal as-is in that case. Otherwise subtract burn balances.
    const effectiveRaw = rawTotal < initialRaw
      ? BigInt(rawTotal)
      : (BigInt(rawTotal) - burnedRaw >= 0n ? BigInt(rawTotal) - burnedRaw : 0n);

    // Return ONLY a whole number in human-readable units
    const human = Number(ethers.formatUnits(effectiveRaw, decimals));
    const integerDisplay = Math.floor(human).toString();

    res.setHeader("Content-Type", "text/plain");
    res.send(integerDisplay);
  } catch (_err) {
    res.setHeader("Content-Type", "text/plain");
    res.send("NA");
  }
}
