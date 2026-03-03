export function abort(message: usize, fileName: usize, line: u32, column: u32): void { unreachable(); }

import { u256 } from "@btc-vision/as-bignum/assembly";
import {
    Address,
    Blockchain,
    BytesWriter,
    Calldata,
    encodeSelector,
    NetEvent,
    OP_NET,
    Revert,
    SafeMath,
    Selector,
} from "@btc-vision/btc-runtime/runtime";
import { EMPTY_POINTER } from "@btc-vision/btc-runtime/runtime/math/bytes";
import { StoredU256 } from "@btc-vision/btc-runtime/runtime/storage/StoredU256";

class MultiSentEvent extends NetEvent {
    constructor(token: Address, count: u32) {
        const w = new BytesWriter(32 + 4);
        w.writeAddress(token);
        w.writeU32(count);
        super("MultiSent", w);
    }
}

@final
export class MultiSender extends OP_NET {

    private _txCount: StoredU256 = new StoredU256(1, EMPTY_POINTER);

    // ✅ BẮT BUỘC cho OP_NET deploy
    public onDeploy(): void {
        // có thể để trống
    }

    public execute(method: Selector, calldata: Calldata): BytesWriter {
        switch (method) {
            case encodeSelector("multiSend(address,address[],uint256[])"):
                return this.multiSend(calldata);
            default:
                return super.execute(method, calldata);
        }
    }

    private multiSend(calldata: Calldata): BytesWriter {

        const token = calldata.readAddress();
        const count = calldata.readU32();

        if (count == 0) throw new Revert("No recipients");
        if (count > 200) throw new Revert("Too many recipients");

        const recipients = new Array<Address>(count as i32);
        const amounts    = new Array<u256>(count as i32);

        let total = u256.Zero;

        for (let i: u32 = 0; i < count; i++) {
            recipients[i] = calldata.readAddress();
            amounts[i]    = calldata.readU256();
            total = SafeMath.add(total, amounts[i]);
        }

        // 🔹 transferFrom(sender → contract)
        const fromWriter = new BytesWriter(4 + 32 + 32 + 32);
        fromWriter.writeSelector(
            encodeSelector("transferFrom(address,address,uint256)")
        );
        fromWriter.writeAddress(Blockchain.tx.sender);
        fromWriter.writeAddress(Blockchain.contractAddress);
        fromWriter.writeU256(total);

        const okFrom = Blockchain.call(token, fromWriter);
        if (!okFrom) throw new Revert("transferFrom failed");

        // 🔹 transfer(contract → recipients)
        for (let i: u32 = 0; i < count; i++) {

            const toWriter = new BytesWriter(4 + 32 + 32);
            toWriter.writeSelector(
                encodeSelector("transfer(address,uint256)")
            );
            toWriter.writeAddress(recipients[i]);
            toWriter.writeU256(amounts[i]);

            const okTo = Blockchain.call(token, toWriter);
            if (!okTo) throw new Revert("transfer failed");
        }

        // update counter
        this._txCount.set(
            SafeMath.add(this._txCount.value, u256.One)
        );

        this.emitEvent(new MultiSentEvent(token, count));

        const w = new BytesWriter(1);
        w.writeBoolean(true);
        return w;
    }
}