import { Address, AddressMap, ExtendedAddressMap, SchnorrSignature } from '@btc-vision/transaction';
import { CallResult, OPNetEvent, IOP_NETContract } from 'opnet';

// ------------------------------------------------------------------
// Event Definitions
// ------------------------------------------------------------------
export type MultiSentBTCEvent = {
    readonly total: bigint;
    readonly recipients: number;
};
export type FeesWithdrawnEvent = {
    readonly amount: bigint;
};

// ------------------------------------------------------------------
// Call Results
// ------------------------------------------------------------------

/**
 * @description Represents the result of the multiSendBTC function call.
 */
export type MultiSendBTC = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<MultiSentBTCEvent>[]
>;

/**
 * @description Represents the result of the withdrawFees function call.
 */
export type WithdrawFees = CallResult<
    {
        amount: bigint;
    },
    OPNetEvent<FeesWithdrawnEvent>[]
>;

// ------------------------------------------------------------------
// IMultiSender
// ------------------------------------------------------------------
export interface IMultiSender extends IOP_NETContract {
    multiSendBTC(addressAndAmount: AddressMap<bigint>): Promise<MultiSendBTC>;
    withdrawFees(to: Address): Promise<WithdrawFees>;
}
