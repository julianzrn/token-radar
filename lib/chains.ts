// Chain cost tiers for the farm plans.
//
// A farm plan has to name a cost, and the honest driver of cost is the chain a position lives on:
// the same deposit is a $12 transaction on Ethereum mainnet and a few cents on a rollup. This table
// is chain metadata, not protocol data: it is keyed by the chain names the snapshot itself uses
// (DefiLlama's spellings) and never by a protocol's name or slug. A chain the table does not name
// gets the middle tier, which is the conservative default for a modern sidechain or appchain.
//
// The dollar figures are planning estimates for one swap-class transaction (a deposit, a supply or
// a small trade) and one light weekly transaction (a claim, a vote or a top-up), stated in the
// dashboard's method notes as estimates, not quotes.

/** One cost tier: what the two recurring farm transactions cost on chains of this class. */
export interface ChainTier {
  /** Short class name the dashboard shows: 'Ethereum L1', 'L2 / low-fee' or 'mid-fee chain'. */
  label: string;
  /** Estimated cost of one swap-class transaction, in whole dollars. */
  action_gas_usd: number;
  /** Estimated cost of one light weekly transaction, in whole dollars. */
  weekly_gas_usd: number;
}

const L1: ChainTier = { label: 'Ethereum L1', action_gas_usd: 12, weekly_gas_usd: 6 };
const LOW: ChainTier = { label: 'L2 / low-fee chain', action_gas_usd: 1, weekly_gas_usd: 1 };
const MID: ChainTier = { label: 'mid-fee chain', action_gas_usd: 3, weekly_gas_usd: 2 };
const BTC: ChainTier = { label: 'Bitcoin', action_gas_usd: 2, weekly_gas_usd: 2 };

/** Chains whose fees are mainnet-class: a position there costs real gas and the plan says so. */
const L1_CHAINS = new Set(['Ethereum']);

/** Bitcoin itself: no smart-contract wallet flow, fees are miner fees on a simple transfer. */
const BTC_CHAINS = new Set(['Bitcoin']);

/**
 * Low-fee chains: rollups, sidechains and modern L1s where a swap-class transaction is a dollar
 * or less in ordinary conditions. Names are DefiLlama's, as the snapshot writes them.
 */
const LOW_CHAINS = new Set([
  'Arbitrum', 'Base', 'Optimism', 'Polygon', 'Binance', 'Solana', 'Avalanche', 'Linea', 'Scroll',
  'zkSync Era', 'Mantle', 'Blast', 'Unichain', 'Sonic', 'Fantom', 'xDai', 'Gnosis', 'Celo', 'Tron',
  'Sui', 'Aptos', 'Near', 'Sei', 'Berachain', 'Monad', 'Hyperliquid L1', 'Plasma', 'TON', 'Cardano',
  'Starknet', 'Mode', 'Taiko', 'Zora', 'Fraxtal', 'World Chain', 'Ink', 'Soneium', 'Abstract',
  'Corn', 'Bob', 'Merlin', 'Core', 'Bitlayer', 'Rootstock', 'Fuse', 'Moonbeam', 'Moonriver',
  'Kava', 'Cronos', 'Aurora', 'Harmony', 'Metis', 'Boba', 'Polygon zkEVM', 'Manta', 'Fuel',
]);

/** The cost tier of one chain name, as the snapshot writes it. Unknown names take the middle tier. */
export function chainTier(chain: string): ChainTier {
  if (L1_CHAINS.has(chain)) return L1;
  if (BTC_CHAINS.has(chain)) return BTC;
  if (LOW_CHAINS.has(chain)) return LOW;
  return MID;
}

/** The tier of a protocol's first-listed chain, or the middle tier when it lists none. */
export function primaryTier(chains: string[]): ChainTier {
  return chains.length > 0 ? chainTier(chains[0]!) : MID;
}
