import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    Address, Blockchain, BytesWriter, Calldata, OP_NET, ABIDataTypes, method
} from '@btc-vision/btc-runtime/runtime';

@final
export class MultiSender extends OP_NET {
    private readonly MAX_RECIPS: i32 = 100;

    constructor() { super(); }

    @method({ name: 'sendBatch', type: ABIDataTypes.VOID })
    public sendBatch(calldata: Calldata): void {
        // Đọc mảng từ Calldata (cần thiết để tiết kiệm gas)
        const recipients = calldata.readAddressArray();
        const amounts = calldata.readU256Array();

        assert(recipients.length == amounts.length, "Mảng không khớp");
        assert(recipients.length <= this.MAX_RECIPS, "Vượt quá giới hạn");

        for (let i = 0; i < recipients.length; i++) {
            // Chuyển token cho từng địa chỉ
            this._encodeTransfer(recipients[i], amounts[i]);
        }
        
        Blockchain.log('Batch transfer completed');
    }

    private _encodeTransfer(to: Address, amount: u256): void {
        // Logic gọi transfer của hệ thống OP_NET
        const w = new BytesWriter(64);
        w.writeAddress(to);
        w.writeU256(amount);
        // Gửi lệnh thực thi
        Blockchain.call(Blockchain.contractAddress, "transfer", w.getBuffer());
    }
}
