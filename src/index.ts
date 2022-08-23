
import { AlphaRouter, CurrencyAmount, routeToString } from '@uniswap/smart-order-router';
import { Currency, Token, TradeType } from '@uniswap/sdk-core';
import fs from 'fs';
import { Protocol } from '@uniswap/router-sdk';
import { ethers } from 'ethers';
import UNI_AAVE_100 from './data/uni-aave-100.json'
import BOND_WETH_100 from './data/bond-weth-100.json'

/// get JSON_RPC_URL from .env
const JSON_RPC_URL = process.env.JSON_RPC_URL;

type DexTradeType = {
    token_a_address: string,
    token_a_amount_raw: number,
    token_b_address: string,
    token_b_amount_raw: number,
    usd_amount: number
    tx_hash: string
}

const removeEscapeCharacters = (str: string) => {
    return str.replace(/\\x/, '0x');
}

const preprocessDuneRaw = (raw: {
    data: DexTradeType
}[]): DexTradeType[] => {
    return raw.map(({ data }) => {
        return {
            token_a_address: removeEscapeCharacters(data.token_a_address),
            token_a_amount_raw: data.token_a_amount_raw,
            token_b_address: removeEscapeCharacters(data.token_b_address),
            token_b_amount_raw: data.token_b_amount_raw,
            usd_amount: data.usd_amount,
            tx_hash: removeEscapeCharacters(data.tx_hash)
        }
    })
}

const provider = new ethers.providers.InfuraProvider("mainnet", process.env.INFURA_KEY);

const alphaRouter = new AlphaRouter({
    chainId: 1,
    provider: provider,
})

let res: {
    mixedRouteQuote: string,
    oldQuote: string,
    delta: string,
    data: DexTradeType
}[] = []

/**
 * @notice Since the MixedRouteQuoterV1 was not deployed on chain before a recent block, we cannot
 *         simulate mixed route quotes for historical transactions.
 * However, we can simulate a quote that excludes mixed routes from consideration, and if it is worse
 * than the swaps executed on chain after mixed routes were implemented, we can see how much the user benefited from
 * the mixed route swap.
 * 
 */
const runSimulation = async (data: DexTradeType, tokenA: Token, tokenB: Token) => {
    // get blockNumber at txHash
    const receipt = await provider.getTransactionReceipt(data.tx_hash);
    const blockNumber = receipt.blockNumber;

    console.log("blockNumber: ", blockNumber);

    const amountIn = CurrencyAmount.fromRawAmount(
        tokenA,
        data.token_a_amount_raw);

    const swap = await alphaRouter.route(
        amountIn,
        tokenB,
        /// @dev not all of the saved data is EXACT_INPUT
        TradeType.EXACT_INPUT,
        undefined,
        {
            blockNumber: blockNumber,
            /// @dev we request a quote NOT allowing mixed
            protocols: [Protocol.V2, Protocol.V3],
        }
    )
    if (!swap) {
        console.log("could not find swap for", data)
        return;
    }

    const mixedRouteSwap = await alphaRouter.route(
        amountIn,
        tokenB,
        /// @dev not all of the saved data is EXACT_INPUT
        TradeType.EXACT_INPUT,
        undefined,
        {
            blockNumber: blockNumber,
            protocols: [Protocol.V2, Protocol.V3, Protocol.MIXED],
            forceMixedRoutes: true
        }
    )

    if (!mixedRouteSwap) {
        console.log("could not find mixed route swap for", data)
        return;
    }

    const { quote, route } = swap;
    const originalAmountOut = CurrencyAmount.fromRawAmount(tokenB as Currency, data.token_b_amount_raw)
    /// quote will be in TokenB
    console.log("Original swap executed on chain quote was: ", originalAmountOut.toExact());
    console.log("Old quote returned: ", quote.toExact());
    console.log("Mixed route quote returned: ", mixedRouteSwap.quote.toExact());

    if (mixedRouteSwap.quote.greaterThan(quote)) {
        /// Means that the mixed route swap is better
        console.log("Mixed routes are better than regular quote");
        const delta = mixedRouteSwap.quote.subtract(quote);
        console.log("Gain: ", delta.toExact())
        res.push({
            mixedRouteQuote: mixedRouteSwap.quote.toExact(),
            oldQuote: quote.toExact(),
            delta: delta.toExact(),
            data: data
        });
    }
    console.log("\n")
}

const main = async () => {
    const data = preprocessDuneRaw(UNI_AAVE_100);
    console.log("Loaded ", data.length, " transactions");

    /// Change for different tokens
    const tokenA = new Token(1, data[0].token_a_address, 18, "UNI", "UNI");
    const tokenB = new Token(1, data[0].token_b_address, 18, "AAVE", "AAVE");

    const blockNumber = await provider.getBlockNumber();
    console.log("Current blockNumber: ", blockNumber);

    for (const trade of data) {
        await runSimulation(trade, tokenA, tokenB);
    }

    console.log("Found ", res.length, " trades where mixed routes were better than the swaps executed on chain");
    console.log(res);

    /// write res to json file
    const json = JSON.stringify(res);
    fs.writeFileSync("./results/uni-aave-100-results.json", json);
}

main();