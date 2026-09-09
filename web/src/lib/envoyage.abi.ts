// GENERATED from out/Envoyage.sol/Envoyage.json — do not edit by hand.
// A hand-written ABI omitted compound() entirely; the "does this selector exist on
// the ABI" check in actions.ts is only meaningful when the ABI is the compiler's.
export const envoyageAbi = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "posm",
        "type": "address",
        "internalType": "contract IPositionManager"
      },
      {
        "name": "poolManager",
        "type": "address",
        "internalType": "contract IPoolManager"
      },
      {
        "name": "permit2",
        "type": "address",
        "internalType": "contract IAllowanceTransfer"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "receive",
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "MAX_FEE_BPS_CEILING",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint16",
        "internalType": "uint16"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "PERMIT2",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IAllowanceTransfer"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "POOL_MANAGER",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IPoolManager"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "POSM",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IPositionManager"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "activeMandate",
    "inputs": [
      {
        "name": "tokenId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "mandateId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "canCompound",
    "inputs": [
      {
        "name": "mandateId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes4",
        "internalType": "bytes4"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "compound",
    "inputs": [
      {
        "name": "mandateId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "minFee",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "grant",
    "inputs": [
      {
        "name": "m",
        "type": "tuple",
        "internalType": "struct IEnvoyage.Mandate",
        "components": [
          {
            "name": "keeper",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "grantor",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "tokenId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "maxFeeBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "feeRecipient",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "expiry",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "minInterval",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "lastCall",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "compoundAllowed",
            "type": "bool",
            "internalType": "bool"
          }
        ]
      }
    ],
    "outputs": [
      {
        "name": "mandateId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "mandates",
    "inputs": [
      {
        "name": "mandateId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "keeper",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "grantor",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "tokenId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "maxFeeBps",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "feeRecipient",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "expiry",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "minInterval",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "lastCall",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "compoundAllowed",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "nextMandateId",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "revoke",
    "inputs": [
      {
        "name": "mandateId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "MandateExecuted",
    "inputs": [
      {
        "name": "id",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "fee0Paid",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "fee1Paid",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "liquidityAdded",
        "type": "uint128",
        "indexed": false,
        "internalType": "uint128"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "MandateGranted",
    "inputs": [
      {
        "name": "id",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "keeper",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "tokenId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "MandateRevoked",
    "inputs": [
      {
        "name": "id",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "CompoundNotAllowed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "CooldownActive",
    "inputs": []
  },
  {
    "type": "error",
    "name": "FeeBelowMinimum",
    "inputs": []
  },
  {
    "type": "error",
    "name": "FeeCapTooHigh",
    "inputs": []
  },
  {
    "type": "error",
    "name": "MandateAlreadyActive",
    "inputs": []
  },
  {
    "type": "error",
    "name": "MandateExpired",
    "inputs": []
  },
  {
    "type": "error",
    "name": "MandateInactive",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotKeeper",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotPositionOwner",
    "inputs": []
  },
  {
    "type": "error",
    "name": "OwnerChanged",
    "inputs": []
  },
  {
    "type": "error",
    "name": "Reentrancy",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ResidualBalance",
    "inputs": []
  },
  {
    "type": "error",
    "name": "TransferFailed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ZeroLiquidityDelta",
    "inputs": []
  }
] as const;
