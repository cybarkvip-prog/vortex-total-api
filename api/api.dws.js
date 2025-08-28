import { ethers } from "ethers";

// ---------- CONFIG ----------
const BASE_RPC = "https://mainnet.base.org";
const TOKEN = "0xeed0b37580fd9ee711f0a477b2be5c306b41ef12"; // Vortex
const INITIAL_TOTAL_SUPPLY = 10_000_000_000n; // 10B tokens (human units)

// Burn addresses that are verifiably non-recoverable
const BURN_ADDRESSES = [
  "0x0000000000000000000000000000000000000000",
  "0x000000000000000000000000000000000000dEaD"
  // add more here if your token uses others
];

// Minimal ERC20 ABI
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

    // Read on-chain values
    const [rawTotal, decimals] = await Promise.all([
      contract.totalSupply(), // raw smallest units
      contract.decimals()
    ]);

    // Compute initial supply in raw units (10B * 10^decimals)
    const factor = 10n ** BigInt(decimals);
    const initialRaw = INITIAL_TOTAL_SUPPLY * factor;

    // Sum balances at known burn addresses (raw units)
    let burnedRaw = 0n;
    if (BURN_ADDRESSES.length) {
      const balances = await Promise.all(
        BURN_ADDRESSES.map(addr => contract.balanceOf(addr))
      );
      burnedRaw = balances.reduce((acc, b) => acc + BigInt(b), 0n);
    }

    // Heuristic to avoid double-subtracting burns:
    // If rawTotal < initialRaw, the contract already reduces totalSupply on burn.
    // In that case, use rawTotal as-is. Otherwise, subtract burn address balances.
    const effectiveRaw =
      rawTotal < initialRaw ? rawTotal : (rawTotal - burnedRaw >= 0n ? rawTotal - burnedRaw : 0n);

    // Return ONLY a whole number in human-readable token units
    const human = Number(ethers.formatUnits(effectiveRaw, decimals));
    const integerDisplay = Math.floor(human).toString();

    res.setHeader("Content-Type", "text/plain");
    res.send(integerDisplay);
  } catch (err) {
    // Strict format on error
    res.setHeader("Content-Type", "text/plain");
    res.send("NA");
  }
}
