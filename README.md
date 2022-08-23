## Documentation

Given a dataset of historical Uniswap trades, this script will use the AutoRouter in @uniswap/smart-order-router to find whether or not a Mixed Route was more profitable than routes only through v2 or v3.

## Getting data from Dune
Write a sample query for the `dex.trades` table and get the columns `token_a_address, token_a_amount_raw, token_b_address, token_b_amount_raw, usd_amount, tx_hash`.

Here's my sample query:
https://dune.com/queries/1193422

## Running the script
1. `yarn install`
2. Save the data into a json file under `src/data`
3. Create a `.env` file at the top level with yoru own `INFURA_KEY`
4. `yarn build && yarn start`
