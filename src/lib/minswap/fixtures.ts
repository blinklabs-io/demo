import type { MinswapUtxo } from "./data";

export const poolFixtures: MinswapUtxo[] = [
  {
    address:
      "addr_test1zrtt4xm4p84vse3g3l6swtf2rqs943t0w39ustwdszxt3l5rajt8r8wqtygrfduwgukk73m5gcnplmztc5tl5ngy0upqhns793",
    tx_hash: "3c764a8d36bf4d206fc92a214ba8ac69612e678e517dc382814961d055207b1f",
    output_index: 0,
    amount: [
      {
        unit: "lovelace",
        quantity: "4500000",
      },
      {
        unit: "d6aae2059baee188f74917493cf7637e679cd219bdfbbf4dcbeb1d0b7a87ad417d9c312750b5469bea4e260734ed28fa5caa42c46c7fc95b74d2477c",
        quantity: "9223372030530220496",
      },
      {
        unit: "d6aae2059baee188f74917493cf7637e679cd219bdfbbf4dcbeb1d0b4d5350",
        quantity: "1",
      },
      {
        unit: "e16c2dc8ae937e8d3790c7fd7168d7b994621ba14ca11415f39fed720014df104341544c415a59",
        quantity: "2000000000",
      },
      {
        unit: "e16c2dc8ae937e8d3790c7fd7168d7b994621ba14ca11415f39fed720014df104341544b555445",
        quantity: "20000000000",
      },
    ],
    inline_datum:
      "d8799fd8799fd87a9f581cfb39ea6bb975ea6de4a2c51572234dc584c89beccc09a49934389e51ffffd8799f581ce16c2dc8ae937e8d3790c7fd7168d7b994621ba14ca11415f39fed724b0014df104341544b555445ffd8799f581ce16c2dc8ae937e8d3790c7fd7168d7b994621ba14ca11415f39fed724b0014df104341544c415a59ff1b0000000178f90e391b00000004a817c8001a7735940018c318c3d8799f190682ffd87980ff",
  },
  {
    address:
      "addr_test1zrtt4xm4p84vse3g3l6swtf2rqs943t0w39ustwdszxt3l5rajt8r8wqtygrfduwgukk73m5gcnplmztc5tl5ngy0upqhns793",
    tx_hash: "35e13dd2504fc2a1bd1e5896a141be9a4c16601d6ea555e3d76b8ee67e4841e4",
    output_index: 0,
    amount: [
      {
        unit: "lovelace",
        quantity: "24500000",
      },
      {
        unit: "e16c2dc8ae937e8d3790c7fd7168d7b994621ba14ca11415f39fed72686f6d656c616e646572",
        quantity: "500000",
      },
      {
        unit: "d6aae2059baee188f74917493cf7637e679cd219bdfbbf4dcbeb1d0b5c39a7bc010c7063afc066ac648db7d5c1920a6ae1ec9b9747eaf5c6a3340c55",
        quantity: "9223372036851613539",
      },
      {
        unit: "d6aae2059baee188f74917493cf7637e679cd219bdfbbf4dcbeb1d0b4d5350",
        quantity: "1",
      },
    ],
    inline_datum:
      "d8799fd8799fd87a9f581cfb39ea6bb975ea6de4a2c51572234dc584c89beccc09a49934389e51ffffd8799f4040ffd8799f581ce16c2dc8ae937e8d3790c7fd7168d7b994621ba14ca11415f39fed724a686f6d656c616e646572ff1a003040a61a01312d001a0007a120181e181ed8799f190682ffd87980ff",
  },
];
