import { ABIDataTypes, BitcoinAbiTypes, OP_NET_ABI } from 'opnet';

export const MultiSenderEvents = [
    {
        name: 'MultiSentBTC',
        values: [
            { name: 'total', type: ABIDataTypes.UINT256 },
            { name: 'recipients', type: ABIDataTypes.UINT32 },
        ],
        type: BitcoinAbiTypes.Event,
    },
    {
        name: 'FeesWithdrawn',
        values: [{ name: 'amount', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Event,
    },
];

export const MultiSenderAbi = [
    {
        name: 'multiSendBTC',
        inputs: [{ name: 'addressAndAmount', type: ABIDataTypes.ADDRESS_UINT256_TUPLE }],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'withdrawFees',
        inputs: [{ name: 'to', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'amount', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    ...MultiSenderEvents,
    ...OP_NET_ABI,
];

export default MultiSenderAbi;
