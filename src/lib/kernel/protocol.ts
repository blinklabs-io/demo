import { DINGO_NETWORK } from "../dingo/config";
export const KERNEL_LANES = {
  "loan-negotiation": {
    family: "loans",
    validatorHash: "b07bdac32910d4c1ea425edadf87ebbe1393394ee36623e97e1d14cc",
    beaconPolicy: "bafab778fcba151ae58c56e6b6915df1c7e067d8034a1c87844351dc",
    references: [
      {
        hash: "69049298b1b240955e56775d586542cc5b246d3aa0a6843a9c26c24b263a256e",
        index: 0,
        hashScript: "b07bdac32910d4c1ea425edadf87ebbe1393394ee36623e97e1d14cc",
      },
      {
        hash: "aae9b47200c5eb99d8cdc07297d50ad47a939e90bec6123fe275d8d7676385d0",
        index: 0,
        hashScript: "bafab778fcba151ae58c56e6b6915df1c7e067d8034a1c87844351dc",
      },
    ],
  },
  "loan-active": {
    family: "loans",
    validatorHash: "b07bdac32910d4c1ea425edadf87ebbe1393394ee36623e97e1d14cc",
    beaconPolicy: "1829838deb88b6b54990860f64fdf6817a25a8c9df5a79985d9abca8",
    references: [
      {
        hash: "69049298b1b240955e56775d586542cc5b246d3aa0a6843a9c26c24b263a256e",
        index: 0,
        hashScript: "b07bdac32910d4c1ea425edadf87ebbe1393394ee36623e97e1d14cc",
      },
      {
        hash: "5abff02703cb285c3a6381ae0e9c16eee8381a04a7c5f18f05b735b5c4823530",
        index: 0,
        hashScript: "1829838deb88b6b54990860f64fdf6817a25a8c9df5a79985d9abca8",
      },
    ],
  },
  "option-proposals": {
    family: "options",
    validatorHash: "473e570a5bac8764358e48b77eff4ef07c8987a023864c70fccc9875",
    beaconPolicy: "01b4f852b1c26c942abc6fdc3478d9ae91d709bb30ee7ae70cdb9ae5",
    references: [
      {
        hash: "82ac4b618f9315cda59a6dbed59f9debad492e90335c7e17ebac10b2b9b00ed9",
        index: 0,
        hashScript: "473e570a5bac8764358e48b77eff4ef07c8987a023864c70fccc9875",
      },
      {
        hash: "101c2c11149a2b81eb1aab19686410883833da9d457fc5d3cc9e632badb5acd9",
        index: 0,
        hashScript: "01b4f852b1c26c942abc6fdc3478d9ae91d709bb30ee7ae70cdb9ae5",
      },
    ],
  },
  "option-active": {
    family: "options",
    validatorHash: "473e570a5bac8764358e48b77eff4ef07c8987a023864c70fccc9875",
    beaconPolicy: "2e35ca8f2a22e65ea36f9a207e64705dd56096bf3ac2724251a180e5",
    references: [
      {
        hash: "82ac4b618f9315cda59a6dbed59f9debad492e90335c7e17ebac10b2b9b00ed9",
        index: 0,
        hashScript: "473e570a5bac8764358e48b77eff4ef07c8987a023864c70fccc9875",
      },
      {
        hash: "843f93739aefad02677dbb804a99f1d32485b45efcff7b4bb88baab26e0bd08d",
        index: 0,
        hashScript: "2e35ca8f2a22e65ea36f9a207e64705dd56096bf3ac2724251a180e5",
      },
    ],
  },
  aftermarket: {
    family: "aftermarket",
    validatorHash: "e07ee8979776692ce3477b0c0d53b4c650ef6ccad75c2596da22847c",
    beaconPolicy: "bdceb595b8754726b3efe3ab0f81c76cbda1a0a0d3653bb8fad89bb2",
    references: [
      {
        hash: "e95a73a1e03afdf74b86d10e504b64285f7afdfab7f7021a41054ae4b377ca9f",
        index: 0,
        hashScript: "e07ee8979776692ce3477b0c0d53b4c650ef6ccad75c2596da22847c",
      },
      {
        hash: "6c402050892c8cb0e3e54f803d7ae292d6f5f90745b7f76722f7c303c7085d50",
        index: 0,
        hashScript: "bdceb595b8754726b3efe3ab0f81c76cbda1a0a0d3653bb8fad89bb2",
      },
    ],
  },
  "one-way": {
    family: "one-way",
    validatorHash: "01fa36465dfe36e26c21fdbf720e4bdafcc0b86bb5367fca46012f56",
    beaconPolicy: "47cec2a1404ed91fc31124f29db15dc1aae77e0617868bcef351b8fd",
    references: [
      {
        hash: "9fecc1d2cf99088facad02aeccbedb6a4f783965dc6c02bd04dc8b348e9a0858",
        index: 0,
        hashScript: "01fa36465dfe36e26c21fdbf720e4bdafcc0b86bb5367fca46012f56",
      },
      {
        hash: "9fecc1d2cf99088facad02aeccbedb6a4f783965dc6c02bd04dc8b348e9a0858",
        index: 1,
        hashScript: "47cec2a1404ed91fc31124f29db15dc1aae77e0617868bcef351b8fd",
      },
    ],
  },
  "two-way": {
    family: "two-way",
    validatorHash: "87381f0bf416e2dae7497d3fcd8087cf677b3cb4b2aeba36ed8f8f79",
    beaconPolicy: "84662c22dc5c0cadad7b2ebf9757ce9ea61dbd8fe64bc8c43c112a40",
    references: [
      {
        hash: "115c9ebb9928b8ec6e0c9d1420c43421cfb323639dd9fdcf1e7155e73bec13c5",
        index: 0,
        hashScript: "87381f0bf416e2dae7497d3fcd8087cf677b3cb4b2aeba36ed8f8f79",
      },
      {
        hash: "115c9ebb9928b8ec6e0c9d1420c43421cfb323639dd9fdcf1e7155e73bec13c5",
        index: 1,
        hashScript: "84662c22dc5c0cadad7b2ebf9757ce9ea61dbd8fe64bc8c43c112a40",
      },
    ],
  },
} as const;
export type KernelLane = keyof typeof KERNEL_LANES;
export function assertKernelNetwork() {
  if (DINGO_NETWORK.id !== "preprod")
    throw new Error("Kernel contracts require Preprod.");
}

export const KERNEL_SOURCES = {
  swaps: "2bb88c506a8fe640a7d851409dd509a844545a6c",
  loans: "1890f6f1ea74599615b0dea5829fffaed6ea9200",
  options: "b69127fd6db0bc48d49aa1f7ab278fc4095b68a8",
  aftermarket: "ba6ee294584debbf9f2f00175fd73fb293cf2972",
} as const;
export const KERNEL_OBSERVERS = {
  aftermarket: {
    hash: "3e5528d9a7610aa5459a7deed9d3c1c2ee8b0310fae6642df4c37213",
    ref: "b6b5bd23fa762b2630dc9dedc10d0bac61d6ffa3617f451df8a8ee31a83c441f",
  },
  loanPayment: {
    hash: "1411f2898599e30829494262bad07dcf4abd92b32d9e4a8f5e53e1f1",
    ref: "8119bc8f8f6fd9aba3d5b26e36d01cd7794c008140644c22613223cc8c01ceef",
  },
  loanInterest: {
    hash: "fc3f4dd5ef895a044ebc1c5f673dff0e4893a0ec0c9559257f14faa7",
    ref: "272e49fdf315a90a6fbdd3e2ce2593877b6a5af8c71eabecd0c32210b6eed4cf",
  },
  loanAddress: {
    hash: "1ed9683dadf154f6cf87da09b70ec279a8613acded7ce8cc2a0d216b",
    ref: "2a02137b2fb0e2a802415160bee0c361dd48e9a0f11df434fda0c22d77fa7b13",
  },
  optionAddress: {
    hash: "46d060e7dbc5787267778aea8d09bcc27bae2d675d9d68fea90e812e",
    ref: "c054959635d30f681e5075cd70b1b3e2bbdbb5214e5dc1c59f99721c4b1126ba",
  },
} as const;
