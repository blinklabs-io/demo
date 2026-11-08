import { EContractVersion, type ISundaeProtocolParamsFull } from "@sundaeswap/core";
export const MAINNET_SUNDAE_V3_PROTOCOL: ISundaeProtocolParamsFull = {
    version: EContractVersion.V3,
    blueprint: { validators: [
            {
                "title": "order.spend",
                "hash": "fa6a58bbe2d0ff05534431c8e2f0ef2cbdc1602a8456e4b13c8f3077",
                "compiledCode": ""
            },
            {
                "title": "pool.spend",
                "hash": "e0302560ced2fdcbfcb2602697df970cd0d6a38f94b32703f51c312b",
                "compiledCode": ""
            },
            {
                "title": "pool.mint",
                "hash": "e0302560ced2fdcbfcb2602697df970cd0d6a38f94b32703f51c312b",
                "compiledCode": ""
            },
            {
                "title": "pool_stake.stake",
                "hash": "4399813dad91bb78a5eb17c26ff50852bc75d3fa7b6e9ae87232ccc1",
                "compiledCode": ""
            },
            {
                "title": "settings.spend",
                "hash": "6d9d7acac59a4469ec52bb207106167c5cbfa689008ffa6ee92acc50",
                "compiledCode": ""
            },
            {
                "title": "settings.mint",
                "hash": "6d9d7acac59a4469ec52bb207106167c5cbfa689008ffa6ee92acc50",
                "compiledCode": ""
            },
            {
                "title": "stake.stake",
                "hash": "99e5aacf401fed0eb0e2993d72d423947f42342e8f848353d03efe61",
                "compiledCode": ""
            }
        ] },
    references: [
        {
            "key": "order.spend",
            "txIn": {
                "hash": "f5f1bdfad3eb4d67d2fc36f36f47fc2938cf6f001689184ab320735a28642cf2",
                "index": 0
            }
        },
        {
            "key": "pool.spend",
            "txIn": {
                "hash": "fa46a1d162c59cece3308c5a9d4db9ff2ea17f9c0146ff821c9b445588b017c9",
                "index": 0
            }
        }
    ],
};
export const MAINNET_SUNDAE_V4_DEPLOYMENT = {
    "pool": "21c9b7b965646069f9becebf8b4c3cedaf84c19b109eaa5980a14a26",
    "order": "07eb2fb09d9dd6603870ce6f84c8f8506249152173ddf0c77f1f07ec",
    "settings": "808db58d7d66d348b0cc7d83c202ef1d19534d00bf6c463a531020ad",
    "settingsPolicy": "371738e95ab3f0afba69c6b0896df05d7851a5307a830677b77c2ead",
    "poolPolicy": "d9d5985e0657933005d6eb953aeadad29aa8c36f17e493e2962584ec",
    "basic": "30f1fac08a15ef84ea6a5aa04989b1c2ceeb3b437f2c3103df5aca68",
    "fee": "267eabb980be6699144e85b24283659838b0746e0fd2f08be1423e70",
    "constantSum": "4e1a435f8d55f26068150579c18964e58078082b899e6bb560be7cd5",
    "stableswap": "f47f6594cab956302f7f1cd81ac4122e9ee128146102497feca1a79f",
    "feeToken": "0019b58b8d626ebe1f2ad80fbc01f9125f54b6c6a4d2b45d31178bc72c337f35"
} as const;
export const MAINNET_SUNDAE_V4_REFERENCES = [
    [
        "order.spend",
        "07eb2fb09d9dd6603870ce6f84c8f8506249152173ddf0c77f1f07ec",
        "c1ecddd68eaa61a3fb4c7af2fac6388d7c8fe0065da359943bdfb976e0f4be9a"
    ],
    [
        "basic_order.withdraw",
        "30f1fac08a15ef84ea6a5aa04989b1c2ceeb3b437f2c3103df5aca68",
        "5df8cb82c9205699cc5187cff8dad47b7ef84cd42faa8c29c7ecc6337b591273"
    ],
    [
        "fee_constraint.withdraw",
        "267eabb980be6699144e85b24283659838b0746e0fd2f08be1423e70",
        "ad6d1e268bb531b675ca105b4fecf6bf84f3dac3fecd09b109c1b52fad8baf10"
    ]
] as const;
