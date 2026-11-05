export const kernelSchemas = {
  swaps: {
    "cardano_swaps/one_way_swap/types/SwapDatum": {
      title: "SwapDatum",
      anyOf: [
        {
          title: "SwapDatum",
          dataType: "constructor",
          index: 0,
          fields: [
            { title: "beacon_id", $ref: "#/definitions/ByteArray" },
            { title: "pair_beacon", $ref: "#/definitions/ByteArray" },
            { title: "offer_id", $ref: "#/definitions/ByteArray" },
            { title: "offer_name", $ref: "#/definitions/ByteArray" },
            { title: "offer_beacon", $ref: "#/definitions/ByteArray" },
            { title: "ask_id", $ref: "#/definitions/ByteArray" },
            { title: "ask_name", $ref: "#/definitions/ByteArray" },
            { title: "ask_beacon", $ref: "#/definitions/ByteArray" },
            {
              title: "swap_price",
              $ref: "#/definitions/cardano_swaps~1common~1types~1Rational",
            },
            {
              title: "prev_input",
              $ref: "#/definitions/Option$aiken~1transaction~1OutputReference",
            },
          ],
        },
      ],
    },
    ByteArray: { dataType: "bytes" },
    "cardano_swaps/common/types/Rational": {
      title: "Rational",
      anyOf: [
        {
          title: "Rational",
          dataType: "constructor",
          index: 0,
          fields: [
            { title: "numerator", $ref: "#/definitions/Int" },
            { title: "denominator", $ref: "#/definitions/Int" },
          ],
        },
      ],
    },
    Int: { dataType: "integer" },
    "Option$aiken/transaction/OutputReference": {
      title: "Optional",
      anyOf: [
        {
          title: "Some",
          dataType: "constructor",
          index: 0,
          fields: [
            { $ref: "#/definitions/aiken~1transaction~1OutputReference" },
          ],
        },
        { title: "None", dataType: "constructor", index: 1, fields: [] },
      ],
    },
    "aiken/transaction/OutputReference": {
      title: "OutputReference",
      anyOf: [
        {
          title: "OutputReference",
          dataType: "constructor",
          index: 0,
          fields: [
            {
              title: "transaction_id",
              $ref: "#/definitions/aiken~1transaction~1TransactionId",
            },
            { title: "output_index", $ref: "#/definitions/Int" },
          ],
        },
      ],
    },
    "aiken/transaction/TransactionId": {
      title: "TransactionId",
      anyOf: [
        {
          title: "TransactionId",
          dataType: "constructor",
          index: 0,
          fields: [{ title: "hash", $ref: "#/definitions/ByteArray" }],
        },
      ],
    },
    "cardano_swaps/two_way_swap/types/SwapDatum": {
      title: "SwapDatum",
      anyOf: [
        {
          title: "SwapDatum",
          dataType: "constructor",
          index: 0,
          fields: [
            { title: "beacon_id", $ref: "#/definitions/ByteArray" },
            { title: "pair_beacon", $ref: "#/definitions/ByteArray" },
            { title: "asset1_id", $ref: "#/definitions/ByteArray" },
            { title: "asset1_name", $ref: "#/definitions/ByteArray" },
            { title: "asset1_beacon", $ref: "#/definitions/ByteArray" },
            { title: "asset2_id", $ref: "#/definitions/ByteArray" },
            { title: "asset2_name", $ref: "#/definitions/ByteArray" },
            { title: "asset2_beacon", $ref: "#/definitions/ByteArray" },
            {
              title: "asset1_price",
              $ref: "#/definitions/cardano_swaps~1common~1types~1Rational",
            },
            {
              title: "asset2_price",
              $ref: "#/definitions/cardano_swaps~1common~1types~1Rational",
            },
            {
              title: "prev_input",
              $ref: "#/definitions/Option$aiken~1transaction~1OutputReference",
            },
          ],
        },
      ],
    },
  },
  loans: {
    "cardano_loans/data/datums/LoanDatum": {
      title: "LoanDatum",
      anyOf: [
        {
          title: "AskDatum",
          dataType: "constructor",
          index: 0,
          fields: [
            { title: "negotiation_beacon_id", $ref: "#/definitions/ByteArray" },
            { title: "active_beacon_id", $ref: "#/definitions/ByteArray" },
            { title: "borrower_id", $ref: "#/definitions/ByteArray" },
            {
              title: "loan_asset",
              $ref: "#/definitions/Tuple$ByteArray_ByteArray",
            },
            { title: "asset_beacon", $ref: "#/definitions/ByteArray" },
            { title: "loan_principal", $ref: "#/definitions/Int" },
            { title: "loan_term", $ref: "#/definitions/Int" },
            {
              title: "collateral",
              $ref: "#/definitions/List$Tuple$ByteArray_ByteArray",
            },
          ],
        },
        {
          title: "OfferDatum",
          dataType: "constructor",
          index: 1,
          fields: [
            { title: "negotiation_beacon_id", $ref: "#/definitions/ByteArray" },
            { title: "active_beacon_id", $ref: "#/definitions/ByteArray" },
            { title: "lender_id", $ref: "#/definitions/ByteArray" },
            {
              title: "lender_address",
              $ref: "#/definitions/aiken~1transaction~1credential~1Address",
            },
            {
              title: "loan_asset",
              $ref: "#/definitions/Tuple$ByteArray_ByteArray",
            },
            { title: "asset_beacon", $ref: "#/definitions/ByteArray" },
            { title: "loan_principal", $ref: "#/definitions/Int" },
            { title: "epoch_duration", $ref: "#/definitions/Option$Int" },
            { title: "loan_term", $ref: "#/definitions/Int" },
            { title: "loan_interest", $ref: "#/definitions/Tuple$Int_Int" },
            { title: "compounding_interest", $ref: "#/definitions/Bool" },
            { title: "min_payment", $ref: "#/definitions/Int" },
            {
              title: "penalty",
              $ref: "#/definitions/cardano_loans~1data~1core~1Penalty",
            },
            {
              title: "collateralization",
              $ref: "#/definitions/List$Tuple$Tuple$ByteArray_ByteArray_Tuple$Int_Int",
            },
            { title: "collateral_is_swappable", $ref: "#/definitions/Bool" },
            { title: "claim_period", $ref: "#/definitions/Int" },
            { title: "offer_deposit", $ref: "#/definitions/Int" },
            { title: "offer_expiration", $ref: "#/definitions/Option$Int" },
          ],
        },
        {
          title: "ActiveDatum",
          dataType: "constructor",
          index: 2,
          fields: [
            { title: "active_beacon_id", $ref: "#/definitions/ByteArray" },
            { title: "payment_observer_hash", $ref: "#/definitions/ByteArray" },
            {
              title: "interest_observer_hash",
              $ref: "#/definitions/ByteArray",
            },
            {
              title: "address_update_observer_hash",
              $ref: "#/definitions/ByteArray",
            },
            { title: "borrower_id", $ref: "#/definitions/ByteArray" },
            {
              title: "lender_address",
              $ref: "#/definitions/aiken~1transaction~1credential~1Address",
            },
            {
              title: "loan_asset",
              $ref: "#/definitions/Tuple$ByteArray_ByteArray",
            },
            { title: "asset_beacon", $ref: "#/definitions/ByteArray" },
            { title: "loan_principal", $ref: "#/definitions/Int" },
            { title: "epoch_duration", $ref: "#/definitions/Option$Int" },
            { title: "last_epoch_boundary", $ref: "#/definitions/Int" },
            { title: "loan_term", $ref: "#/definitions/Int" },
            { title: "loan_interest", $ref: "#/definitions/Tuple$Int_Int" },
            { title: "compounding_interest", $ref: "#/definitions/Bool" },
            { title: "min_payment", $ref: "#/definitions/Int" },
            {
              title: "penalty",
              $ref: "#/definitions/cardano_loans~1data~1core~1Penalty",
            },
            {
              title: "collateralization",
              $ref: "#/definitions/List$Tuple$Tuple$ByteArray_ByteArray_Tuple$Int_Int",
            },
            { title: "collateral_is_swappable", $ref: "#/definitions/Bool" },
            { title: "claim_expiration", $ref: "#/definitions/Int" },
            { title: "loan_expiration", $ref: "#/definitions/Int" },
            { title: "loan_outstanding", $ref: "#/definitions/Tuple$Int_Int" },
            { title: "total_epoch_payments", $ref: "#/definitions/Int" },
            { title: "loan_id", $ref: "#/definitions/ByteArray" },
          ],
        },
      ],
    },
    ByteArray: { dataType: "bytes" },
    Tuple$ByteArray_ByteArray: {
      title: "Tuple",
      dataType: "list",
      items: [
        { $ref: "#/definitions/ByteArray" },
        { $ref: "#/definitions/ByteArray" },
      ],
    },
    Int: { dataType: "integer" },
    List$Tuple$ByteArray_ByteArray: {
      dataType: "map",
      keys: { $ref: "#/definitions/ByteArray" },
      values: { $ref: "#/definitions/ByteArray" },
    },
    "aiken/transaction/credential/Address": {
      title: "Address",
      anyOf: [
        {
          title: "Address",
          dataType: "constructor",
          index: 0,
          fields: [
            {
              title: "payment_credential",
              $ref: "#/definitions/aiken~1transaction~1credential~1Credential",
            },
            {
              title: "stake_credential",
              $ref: "#/definitions/Option$aiken~1transaction~1credential~1Referenced$aiken~1transaction~1credential~1Credential",
            },
          ],
        },
      ],
    },
    "aiken/transaction/credential/Credential": {
      title: "Credential",
      anyOf: [
        {
          title: "VerificationKeyCredential",
          dataType: "constructor",
          index: 0,
          fields: [{ $ref: "#/definitions/ByteArray" }],
        },
        {
          title: "ScriptCredential",
          dataType: "constructor",
          index: 1,
          fields: [{ $ref: "#/definitions/ByteArray" }],
        },
      ],
    },
    "Option$aiken/transaction/credential/Referenced$aiken/transaction/credential/Credential":
      {
        title: "Optional",
        anyOf: [
          {
            title: "Some",
            dataType: "constructor",
            index: 0,
            fields: [
              {
                $ref: "#/definitions/aiken~1transaction~1credential~1Referenced$aiken~1transaction~1credential~1Credential",
              },
            ],
          },
          { title: "None", dataType: "constructor", index: 1, fields: [] },
        ],
      },
    "aiken/transaction/credential/Referenced$aiken/transaction/credential/Credential":
      {
        title: "Referenced",
        anyOf: [
          {
            title: "Inline",
            dataType: "constructor",
            index: 0,
            fields: [
              {
                $ref: "#/definitions/aiken~1transaction~1credential~1Credential",
              },
            ],
          },
          {
            title: "Pointer",
            dataType: "constructor",
            index: 1,
            fields: [
              { title: "slot_number", $ref: "#/definitions/Int" },
              { title: "transaction_index", $ref: "#/definitions/Int" },
              { title: "certificate_index", $ref: "#/definitions/Int" },
            ],
          },
        ],
      },
    Option$Int: {
      title: "Optional",
      anyOf: [
        {
          title: "Some",
          dataType: "constructor",
          index: 0,
          fields: [{ $ref: "#/definitions/Int" }],
        },
        { title: "None", dataType: "constructor", index: 1, fields: [] },
      ],
    },
    Tuple$Int_Int: {
      title: "Tuple",
      dataType: "list",
      items: [{ $ref: "#/definitions/Int" }, { $ref: "#/definitions/Int" }],
    },
    Bool: {
      title: "Bool",
      anyOf: [
        { title: "False", dataType: "constructor", index: 0, fields: [] },
        { title: "True", dataType: "constructor", index: 1, fields: [] },
      ],
    },
    "cardano_loans/data/core/Penalty": {
      title: "Penalty",
      anyOf: [
        { title: "NoPenalty", dataType: "constructor", index: 0, fields: [] },
        {
          title: "FixedFee",
          dataType: "constructor",
          index: 1,
          fields: [{ title: "fixed_fee", $ref: "#/definitions/Int" }],
        },
        {
          title: "PercentFee",
          dataType: "constructor",
          index: 2,
          fields: [
            { title: "percent_fee", $ref: "#/definitions/Tuple$Int_Int" },
          ],
        },
      ],
    },
    List$Tuple$Tuple$ByteArray_ByteArray_Tuple$Int_Int: {
      dataType: "map",
      keys: { $ref: "#/definitions/Tuple$ByteArray_ByteArray" },
      values: { $ref: "#/definitions/Tuple$Int_Int" },
    },
  },
  options: {
    "cardano_options/data/datums/OptionsDatum": {
      title: "OptionsDatum",
      anyOf: [
        {
          title: "ProposalDatum",
          dataType: "constructor",
          index: 0,
          fields: [
            {
              title: "proposal_beacon_policy_id",
              $ref: "#/definitions/ByteArray",
            },
            {
              title: "active_beacon_policy_id",
              $ref: "#/definitions/ByteArray",
            },
            {
              title: "offer_asset",
              $ref: "#/definitions/Tuple$ByteArray_ByteArray",
            },
            { title: "offer_quantity", $ref: "#/definitions/Int" },
            {
              title: "ask_asset",
              $ref: "#/definitions/Tuple$ByteArray_ByteArray",
            },
            { title: "trading_pair_beacon", $ref: "#/definitions/ByteArray" },
            { title: "offer_asset_beacon", $ref: "#/definitions/ByteArray" },
            { title: "ask_asset_beacon", $ref: "#/definitions/ByteArray" },
            {
              title: "premium_asset",
              $ref: "#/definitions/Tuple$ByteArray_ByteArray",
            },
            { title: "premium_asset_beacon", $ref: "#/definitions/ByteArray" },
            { title: "contract_deposit", $ref: "#/definitions/Int" },
            {
              title: "payment_address",
              $ref: "#/definitions/aiken~1transaction~1credential~1Address",
            },
            {
              title: "possible_terms",
              $ref: "#/definitions/List$cardano_options~1data~1core~1Terms",
            },
          ],
        },
        {
          title: "ActiveDatum",
          dataType: "constructor",
          index: 1,
          fields: [
            {
              title: "proposal_beacon_policy_id",
              $ref: "#/definitions/ByteArray",
            },
            {
              title: "active_beacon_policy_id",
              $ref: "#/definitions/ByteArray",
            },
            { title: "address_observer_hash", $ref: "#/definitions/ByteArray" },
            {
              title: "offer_asset",
              $ref: "#/definitions/Tuple$ByteArray_ByteArray",
            },
            { title: "offer_quantity", $ref: "#/definitions/Int" },
            {
              title: "ask_asset",
              $ref: "#/definitions/Tuple$ByteArray_ByteArray",
            },
            { title: "trading_pair_beacon", $ref: "#/definitions/ByteArray" },
            { title: "offer_asset_beacon", $ref: "#/definitions/ByteArray" },
            { title: "ask_asset_beacon", $ref: "#/definitions/ByteArray" },
            { title: "strike_price", $ref: "#/definitions/Tuple$Int_Int" },
            { title: "expiration", $ref: "#/definitions/Int" },
            { title: "contract_deposit", $ref: "#/definitions/Int" },
            {
              title: "payment_address",
              $ref: "#/definitions/aiken~1transaction~1credential~1Address",
            },
            { title: "contract_id", $ref: "#/definitions/ByteArray" },
          ],
        },
      ],
    },
    ByteArray: { dataType: "bytes" },
    Tuple$ByteArray_ByteArray: {
      title: "Tuple",
      dataType: "list",
      items: [
        { $ref: "#/definitions/ByteArray" },
        { $ref: "#/definitions/ByteArray" },
      ],
    },
    Int: { dataType: "integer" },
    "aiken/transaction/credential/Address": {
      title: "Address",
      anyOf: [
        {
          title: "Address",
          dataType: "constructor",
          index: 0,
          fields: [
            {
              title: "payment_credential",
              $ref: "#/definitions/aiken~1transaction~1credential~1Credential",
            },
            {
              title: "stake_credential",
              $ref: "#/definitions/Option$aiken~1transaction~1credential~1Referenced$aiken~1transaction~1credential~1Credential",
            },
          ],
        },
      ],
    },
    "aiken/transaction/credential/Credential": {
      title: "Credential",
      anyOf: [
        {
          title: "VerificationKeyCredential",
          dataType: "constructor",
          index: 0,
          fields: [{ $ref: "#/definitions/ByteArray" }],
        },
        {
          title: "ScriptCredential",
          dataType: "constructor",
          index: 1,
          fields: [{ $ref: "#/definitions/ByteArray" }],
        },
      ],
    },
    "Option$aiken/transaction/credential/Referenced$aiken/transaction/credential/Credential":
      {
        title: "Optional",
        anyOf: [
          {
            title: "Some",
            dataType: "constructor",
            index: 0,
            fields: [
              {
                $ref: "#/definitions/aiken~1transaction~1credential~1Referenced$aiken~1transaction~1credential~1Credential",
              },
            ],
          },
          { title: "None", dataType: "constructor", index: 1, fields: [] },
        ],
      },
    "aiken/transaction/credential/Referenced$aiken/transaction/credential/Credential":
      {
        title: "Referenced",
        anyOf: [
          {
            title: "Inline",
            dataType: "constructor",
            index: 0,
            fields: [
              {
                $ref: "#/definitions/aiken~1transaction~1credential~1Credential",
              },
            ],
          },
          {
            title: "Pointer",
            dataType: "constructor",
            index: 1,
            fields: [
              { title: "slot_number", $ref: "#/definitions/Int" },
              { title: "transaction_index", $ref: "#/definitions/Int" },
              { title: "certificate_index", $ref: "#/definitions/Int" },
            ],
          },
        ],
      },
    "List$cardano_options/data/core/Terms": {
      dataType: "list",
      items: { $ref: "#/definitions/cardano_options~1data~1core~1Terms" },
    },
    "cardano_options/data/core/Terms": {
      title: "Terms",
      anyOf: [
        {
          title: "Terms",
          dataType: "constructor",
          index: 0,
          fields: [
            { title: "premium", $ref: "#/definitions/Int" },
            { title: "strike_price", $ref: "#/definitions/Tuple$Int_Int" },
            { title: "expiration", $ref: "#/definitions/Int" },
          ],
        },
      ],
    },
    Tuple$Int_Int: {
      title: "Tuple",
      dataType: "list",
      items: [{ $ref: "#/definitions/Int" }, { $ref: "#/definitions/Int" }],
    },
  },
  aftermarket: {
    "cardano_aftermarket/data/datums/MarketDatum": {
      title: "MarketDatum",
      anyOf: [
        {
          title: "SpotDatum",
          dataType: "constructor",
          index: 0,
          fields: [
            { title: "beacon_policy_id", $ref: "#/definitions/ByteArray" },
            {
              title: "aftermarket_observer_hash",
              $ref: "#/definitions/ByteArray",
            },
            { title: "nft_policy_id", $ref: "#/definitions/ByteArray" },
            { title: "nft_names", $ref: "#/definitions/List$ByteArray" },
            {
              title: "payment_address",
              $ref: "#/definitions/aiken~1transaction~1credential~1Address",
            },
            { title: "sale_deposit", $ref: "#/definitions/Int" },
            {
              title: "sale_price",
              $ref: "#/definitions/List$Tuple$Tuple$ByteArray_ByteArray_Int",
            },
          ],
        },
        {
          title: "AuctionDatum",
          dataType: "constructor",
          index: 1,
          fields: [
            { title: "beacon_policy_id", $ref: "#/definitions/ByteArray" },
            {
              title: "aftermarket_observer_hash",
              $ref: "#/definitions/ByteArray",
            },
            { title: "nft_policy_id", $ref: "#/definitions/ByteArray" },
            { title: "nft_names", $ref: "#/definitions/List$ByteArray" },
            {
              title: "starting_price",
              $ref: "#/definitions/List$Tuple$Tuple$ByteArray_ByteArray_Int",
            },
          ],
        },
        {
          title: "SpotBidDatum",
          dataType: "constructor",
          index: 2,
          fields: [
            { title: "beacon_policy_id", $ref: "#/definitions/ByteArray" },
            {
              title: "aftermarket_observer_hash",
              $ref: "#/definitions/ByteArray",
            },
            { title: "nft_policy_id", $ref: "#/definitions/ByteArray" },
            {
              title: "bidder_credential",
              $ref: "#/definitions/aiken~1transaction~1credential~1Credential",
            },
            { title: "nft_names", $ref: "#/definitions/List$ByteArray" },
            {
              title: "payment_address",
              $ref: "#/definitions/aiken~1transaction~1credential~1Address",
            },
            { title: "bid_deposit", $ref: "#/definitions/Int" },
            {
              title: "bid",
              $ref: "#/definitions/List$Tuple$Tuple$ByteArray_ByteArray_Int",
            },
          ],
        },
        {
          title: "ClaimBidDatum",
          dataType: "constructor",
          index: 3,
          fields: [
            { title: "beacon_policy_id", $ref: "#/definitions/ByteArray" },
            {
              title: "aftermarket_observer_hash",
              $ref: "#/definitions/ByteArray",
            },
            { title: "nft_policy_id", $ref: "#/definitions/ByteArray" },
            {
              title: "bidder_credential",
              $ref: "#/definitions/aiken~1transaction~1credential~1Credential",
            },
            { title: "nft_names", $ref: "#/definitions/List$ByteArray" },
            { title: "bid_deposit", $ref: "#/definitions/Int" },
            {
              title: "bid",
              $ref: "#/definitions/List$Tuple$Tuple$ByteArray_ByteArray_Int",
            },
            { title: "bid_expiration", $ref: "#/definitions/Option$Int" },
            { title: "claim_expiration", $ref: "#/definitions/Int" },
          ],
        },
        {
          title: "AcceptedBidDatum",
          dataType: "constructor",
          index: 4,
          fields: [
            { title: "beacon_policy_id", $ref: "#/definitions/ByteArray" },
            {
              title: "aftermarket_observer_hash",
              $ref: "#/definitions/ByteArray",
            },
            { title: "nft_policy_id", $ref: "#/definitions/ByteArray" },
            {
              title: "bidder_credential",
              $ref: "#/definitions/aiken~1transaction~1credential~1Credential",
            },
            { title: "nft_names", $ref: "#/definitions/List$ByteArray" },
            { title: "bid_deposit", $ref: "#/definitions/Int" },
            { title: "seller_deposit", $ref: "#/definitions/Int" },
            {
              title: "bid",
              $ref: "#/definitions/List$Tuple$Tuple$ByteArray_ByteArray_Int",
            },
            {
              title: "payment_address",
              $ref: "#/definitions/aiken~1transaction~1credential~1Address",
            },
            { title: "claim_expiration", $ref: "#/definitions/Int" },
          ],
        },
      ],
    },
    ByteArray: { dataType: "bytes" },
    List$ByteArray: {
      dataType: "list",
      items: { $ref: "#/definitions/ByteArray" },
    },
    "aiken/transaction/credential/Address": {
      title: "Address",
      anyOf: [
        {
          title: "Address",
          dataType: "constructor",
          index: 0,
          fields: [
            {
              title: "payment_credential",
              $ref: "#/definitions/aiken~1transaction~1credential~1Credential",
            },
            {
              title: "stake_credential",
              $ref: "#/definitions/Option$aiken~1transaction~1credential~1Referenced$aiken~1transaction~1credential~1Credential",
            },
          ],
        },
      ],
    },
    "aiken/transaction/credential/Credential": {
      title: "Credential",
      anyOf: [
        {
          title: "VerificationKeyCredential",
          dataType: "constructor",
          index: 0,
          fields: [{ $ref: "#/definitions/ByteArray" }],
        },
        {
          title: "ScriptCredential",
          dataType: "constructor",
          index: 1,
          fields: [{ $ref: "#/definitions/ByteArray" }],
        },
      ],
    },
    "Option$aiken/transaction/credential/Referenced$aiken/transaction/credential/Credential":
      {
        title: "Optional",
        anyOf: [
          {
            title: "Some",
            dataType: "constructor",
            index: 0,
            fields: [
              {
                $ref: "#/definitions/aiken~1transaction~1credential~1Referenced$aiken~1transaction~1credential~1Credential",
              },
            ],
          },
          { title: "None", dataType: "constructor", index: 1, fields: [] },
        ],
      },
    "aiken/transaction/credential/Referenced$aiken/transaction/credential/Credential":
      {
        title: "Referenced",
        anyOf: [
          {
            title: "Inline",
            dataType: "constructor",
            index: 0,
            fields: [
              {
                $ref: "#/definitions/aiken~1transaction~1credential~1Credential",
              },
            ],
          },
          {
            title: "Pointer",
            dataType: "constructor",
            index: 1,
            fields: [
              { title: "slot_number", $ref: "#/definitions/Int" },
              { title: "transaction_index", $ref: "#/definitions/Int" },
              { title: "certificate_index", $ref: "#/definitions/Int" },
            ],
          },
        ],
      },
    Int: { dataType: "integer" },
    List$Tuple$Tuple$ByteArray_ByteArray_Int: {
      dataType: "map",
      keys: { $ref: "#/definitions/Tuple$ByteArray_ByteArray" },
      values: { $ref: "#/definitions/Int" },
    },
    Tuple$ByteArray_ByteArray: {
      title: "Tuple",
      dataType: "list",
      items: [
        { $ref: "#/definitions/ByteArray" },
        { $ref: "#/definitions/ByteArray" },
      ],
    },
    Option$Int: {
      title: "Optional",
      anyOf: [
        {
          title: "Some",
          dataType: "constructor",
          index: 0,
          fields: [{ $ref: "#/definitions/Int" }],
        },
        { title: "None", dataType: "constructor", index: 1, fields: [] },
      ],
    },
  },
};
