import { describe, expect, it } from "vitest";
import { decodeHeaderVersion } from "./blockHeader";
import { hexToBytes } from "./utxorpc/bytes";

const conwayHeaderBlock =
  "85828a1a00492cd51a078839b35820ddc4548f18c963a36467ef22ddb46c37ea09067b32b876eec1e90b7772e82c6b5820f93a35971524b875246f4f6548a5f7221244ee445282e5784937fb9bacffae59582084b14943bda0fe47d2ff5f25c28ef55e570f0cd59a75695f5c7e8da4a020908c825840f857b3989990388963228e2f62775945c396ba146e84fbedc05858a2885d05a748cb9a5b2a816e461b9014117f835fc06666a4f335cf61af8be9c6a190e2480b5850158b34be7c1fedc47fa57114ab6a78e8a6356992753f18063ba8fc502533b9c450db9520655b1cfd1f2d45c2012406f9a453c0e1e506d8ecf13bb81fa36978c676c8fece1a4ece6a4992ecf9a9c6b008190cf75820e9b539528e51d9e7c90192c353a6c10a428078e7878fbf77bf09fd7347705d5884582050e8e6c70b3a3b72fdcb9254ed83fdcff2b03ad1d59e0b53aa24f5cac94243c4031903c45840b6621db9bd366c2110abdb7d486353875fad1a32b0cf6e1ce6056f3645b1faed8eebc5299bbc7a76d07052622513982fa7dea657cc714e17dfcad51c88939902820b18455901c02da3963a5e6494c7941a2d822df24643d238307a5a4ccf9dc577bbea45260d17ae43b2ae2b2e4bd98304f14816f053075bd6dfaf4f5222eb18eebc6fbbf4f0000f7d079e2ad06aec53fecf27d5a0f908de8f6abb385ad103def51c8eb92155a842279226d9c6167bdd307f7a997f003ca28c9689e70cf69947679a1264f6446e99c70c775943bf83bc9bb16493f977a6d40c4e3ba0e926f90dba7355027d595e4d0791ecd1b3491d49afa5a5c641c0ec214dea1b20ba9022ba0dd93b1049f1bfa9b843b593534edb163780e1bb5a37b87be0de8d383a29839641530754283e0717cd62fcfb7377d7caaf9bbe1a5a3bb05ae7a2a54e3c0171a2f79cb3b05e472f56c3d456ef9419107d294030fb01de2c0f18a84a24ae168423133d0991bb0689a536ca95c45355f9e84631ec4db6a8ce4b3003d26d7c93bc6db4f9c8dc52917cf22461f4bdc234318274231fee5b7e5b88fb13b70b267ead9e6e170735e1a716b80815d9c17e2d731eba563f88f580cde78887fd26d971c1f2f77777b69b9a47f9641dfd8b9eba3169244c1fafccff647edf35a4b6822bcc353e6cb02b6dc92ed567785456d6034b0e53a4df4552c96ebcf18152070897e00ea86b3117e8e5188080a080";

describe("block header protocol version", () => {
  it("reads the major and Dingo minor marker from a Conway header", () => {
    expect(decodeHeaderVersion(hexToBytes(conwayHeaderBlock))).toEqual({
      major: "11",
      minor: "69",
    });
  });

  it("preserves a zero minor version instead of inferring an implementation", () => {
    const bytes = conwayHeaderBlock.replace("820b1845", "820b00");
    expect(bytes).not.toBe(conwayHeaderBlock);
    expect(decodeHeaderVersion(hexToBytes(bytes))).toEqual({
      major: "11",
      minor: "0",
    });
  });

  it("rejects truncated header bytes", () => {
    expect(() =>
      decodeHeaderVersion(hexToBytes(conwayHeaderBlock.slice(0, 30))),
    ).toThrow();
  });

  it("rejects an unsupported block encoding", () => {
    expect(() => decodeHeaderVersion(hexToBytes("80"))).toThrow(
      "Unsupported block encoding",
    );
  });
});
