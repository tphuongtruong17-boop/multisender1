import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    Address,
    Blockchain,
    BytesWriter,
    Calldata,
    encodeSelector,
    OP_NET,
    Revert,
    SafeMath,
    Selector,
} from '@btc-vision/btc-runtime/runtime';

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

    public override execute(method: Selector, calldata: Calldata): BytesWriter {
        switch (method) {
            case encodeSelector('multiSendBTC()'):
                return this.multiSendBTC(calldata);
            case encodeSelector('withdrawFees()'):
                return this.withdrawFees(calldata);
            default:
                return super.execute(method, calldata);
        }
    }

    private multiSendBTC(calldata: Calldata): BytesWriter {
        const count: u32 = calldata.readU32();
        if (count === 0) throw new Revert('No recipients');
        if (count > u32(this.MAX_RECIPS)) throw new Revert('Exceeds 200 recipients');

        const recipients: Address[] = [];
        const amounts: u256[] = [];
        let total: u256 = u256.Zero;

        for (let i: u32 = 0; i < count; i++) {
            const addr: Address = calldata.readAddress();
            const amt: u256 = calldata.readU256();
            recipients.push(addr);
            amounts.push(amt);
            total = SafeMath.add(total, amt);
        }

        const feeRaw: u256 = SafeMath.div(
            SafeMath.mul(total, u256.fromU64(this.FEE_BPS)),
            u256.fromU64(this.BPS_DENOM),
        );
        const dust: u256 = u256.fromU64(this.DUST);
        const fee: u256 = feeRaw.gt(dust) ? feeRaw : dust;
        const needed: u256 = SafeMath.add(total, fee);

        if (Blockchain.tx.value.lt(needed)) {
            throw new Revert('Insufficient BTC');
        }

        for (let i: i32 = 0; i < recipients.length; i++) {
            Blockchain.transfer(recipients[i], amounts[i]);
        }

        const excess: u256 = SafeMath.sub(Blockchain.tx.value, needed);
        if (excess.gt(dust)) {
            Blockchain.transfer(Blockchain.tx.origin, excess);
        }

        const w = new BytesWriter(1);
        w.writeBoolean(true);
        return w;
    }

    private withdrawFees(calldata: Calldata): BytesWriter {
        this.onlyDeployer(Blockchain.tx.sender);
        const to: Address = calldata.readAddress();
        const bal: u256 = Blockchain.getBalance(Blockchain.contractAddress);
        if (bal.lte(u256.Zero)) throw new Revert('No fees');
        Blockchain.transfer(to, bal);
        const w = new BytesWriter(32);
        w.writeU256(bal);
        return w;
    }
}
