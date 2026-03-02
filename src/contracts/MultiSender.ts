import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    Address,
    Blockchain,
    BytesWriter,
    Calldata,
    NetEvent,
    OP_NET,
    Revert,
    SafeMath,
} from '@btc-vision/btc-runtime/runtime';

// ── Event classes (bắt buộc khai báo để OPNetTransform nhận ra) ──
class MultiSentBTCEvent extends NetEvent {
    constructor(total: u256, recipients: u32) {
        const w = new BytesWriter(36);
        w.writeU256(total);
        w.writeU32(recipients);
        super('MultiSentBTC', w);
    }
}

class FeesWithdrawnEvent extends NetEvent {
    constructor(amount: u256) {
        const w = new BytesWriter(32);
        w.writeU256(amount);
        super('FeesWithdrawn', w);
    }
}

@final
export class MultiSender extends OP_NET {

    private readonly FEE_BPS:    u64 = 10;
    private readonly BPS_DENOM:  u64 = 10000;
    private readonly DUST:       u64 = 546;
    private readonly MAX_RECIPS: i32 = 200;

    public constructor() {
        super();
    }

    public override onDeployment(_calldata: Calldata): void {
        Blockchain.log('MultiSender v1.0 deployed');
    }

    @method({
        name: 'addressAndAmount',
        type: ABIDataTypes.ADDRESS_UINT256_TUPLE,
    })
    @emit('MultiSentBTC')
    @returns({
        name: 'success',
        type: ABIDataTypes.BOOL,
    })
    public multiSendBTC(calldata: Calldata): BytesWriter {
        const map = calldata.readAddressMapU256();
        const addresses: Address[] = map.keys();

        if (addresses.length === 0) throw new Revert('No recipients');
        if (addresses.length > this.MAX_RECIPS) throw new Revert('Exceeds 200');

        let total: u256 = u256.Zero;
        for (let i: i32 = 0; i < addresses.length; i++) {
            const addr = addresses[i];
            if (!addr) throw new Revert('Invalid address');
            total = SafeMath.add(total, map.get(addr));
        }

        const feeRaw = SafeMath.div(
            SafeMath.mul(total, u256.fromU64(this.FEE_BPS)),
            u256.fromU64(this.BPS_DENOM),
        );
        const dust = u256.fromU64(this.DUST);
        const fee = feeRaw.gt(dust) ? feeRaw : dust;

        if (Blockchain.tx.value.lt(SafeMath.add(total, fee)))
            throw new Revert('Insufficient BTC');

        for (let i: i32 = 0; i < addresses.length; i++) {
            const addr = addresses[i];
            Blockchain.transfer(addr, map.get(addr));
        }

        const excess = SafeMath.sub(Blockchain.tx.value, SafeMath.add(total, fee));
        if (excess.gt(dust)) Blockchain.transfer(Blockchain.tx.origin, excess);

        this.emitEvent(new MultiSentBTCEvent(total, u32(addresses.length)));
        return new BytesWriter(0);
    }

    @method({ name: 'to', type: ABIDataTypes.ADDRESS })
    @emit('FeesWithdrawn')
    @returns({ name: 'amount', type: ABIDataTypes.UINT256 })
    public withdrawFees(calldata: Calldata): BytesWriter {
        this.onlyDeployer(Blockchain.tx.sender);
        const to: Address = calldata.readAddress();
        const bal = Blockchain.getBalance(Blockchain.contractAddress);
        if (bal.lte(u256.Zero)) throw new Revert('No fees');
        Blockchain.transfer(to, bal);
        this.emitEvent(new FeesWithdrawnEvent(bal));
        const w = new BytesWriter(32);
        w.writeU256(bal);
        return w;
    }
}
