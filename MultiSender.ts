import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    Address,
    AddressMap,
    Blockchain,
    BytesWriter,
    Calldata,
    OP_NET,
    SafeMath,
} from '@btc-vision/btc-runtime/runtime';

/**
 * OP_NET MultiSender Contract v1.0.0
 *
 * Gửi native BTC hoặc OP-20 token đến nhiều địa chỉ opt1 trong 1 TX.
 * Pattern giống hệt MyToken.ts từ opnet-build template.
 *
 * Deploy: kéo build/MultiSender.wasm vào OP_WALLET
 * Contract address sẽ có dạng: opt1sq...
 */
@final
export class MultiSender extends OP_NET {

    // Phí 0.1% = 10 BPS — INTEGER ONLY, không bao giờ dùng float/f64
    private readonly FEE_BPS:    u64 = 10;
    private readonly BPS_DENOM:  u64 = 10000;
    private readonly DUST:       u64 = 546;   // Bitcoin dust limit (sat)
    private readonly MAX_RECIPS: i32 = 200;   // max recipients per TX

    public constructor() {
        super();
        // IMPORTANT: RUNS EVERY INTERACTION — không init state ở đây
    }

    // Chạy DUY NHẤT 1 lần khi deploy — tương đương constructor Solidity
    public override onDeployment(_calldata: Calldata): void {
        Blockchain.log('MultiSender v1.0 deployed on OP_NET');
    }

    // Chạy khi contract được cập nhật (redeploy)
    public override onUpdate(_calldata: Calldata): void {
        super.onUpdate(_calldata);
    }

    // ─────────────────────────────────────────────────────────────
    //  multiSendBTC
    //  Gửi native BTC (satoshi) đến nhiều địa chỉ opt1
    //
    //  Input: AddressMap<Address, u256>
    //    key   = địa chỉ người nhận (opt1...)
    //    value = số satoshi muốn gửi
    //
    //  Người dùng gửi kèm BTC = tổng + phí khi gọi hàm này
    // ─────────────────────────────────────────────────────────────
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
        const addressAndAmount: AddressMap<u256> = calldata.readAddressMapU256();
        const addresses: Address[] = addressAndAmount.keys();

        if (addresses.length === 0) {
            throw new Error('No recipients provided');
        }
        if (addresses.length > this.MAX_RECIPS) {
            throw new Error('Exceeds 200 recipients per transaction');
        }

        // Tính tổng satoshi cần gửi
        let totalSats: u256 = u256.Zero;
        for (let i: i32 = 0; i < addresses.length; i++) {
            const address = addresses[i];
            if (!address) throw new Error('Invalid recipient address');
            const amount = addressAndAmount.get(address);
            totalSats = SafeMath.add(totalSats, amount);
        }

        // Phí = totalSats * 10 / 10000, tối thiểu 546 sat
        const feeRaw: u256 = SafeMath.div(
            SafeMath.mul(totalSats, u256.fromU64(this.FEE_BPS)),
            u256.fromU64(this.BPS_DENOM),
        );
        const dustU256 = u256.fromU64(this.DUST);
        const fee: u256 = feeRaw.gt(dustU256) ? feeRaw : dustU256;
        const needed: u256 = SafeMath.add(totalSats, fee);

        // Validate: BTC đính kèm TX phải đủ
        if (Blockchain.tx.value.lt(needed)) {
            throw new Error(
                'Insufficient BTC: need ' + needed.toString() +
                ' sat, got ' + Blockchain.tx.value.toString() + ' sat',
            );
        }

        // Gửi BTC đến từng địa chỉ opt1
        for (let i: i32 = 0; i < addresses.length; i++) {
            const address = addresses[i];
            const amount  = addressAndAmount.get(address);
            Blockchain.transfer(address, amount);
        }

        // Hoàn trả BTC thừa về người gửi
        const excess = SafeMath.sub(Blockchain.tx.value, needed);
        if (excess.gt(dustU256)) {
            Blockchain.transfer(Blockchain.tx.origin, excess);
        }

        return new BytesWriter(0);
    }

    // ─────────────────────────────────────────────────────────────
    //  multiSendToken
    //  Gửi OP-20 token đến nhiều địa chỉ opt1
    //
    //  Input:
    //    tokenAddress:     Address     — OP-20 contract (opt1...)
    //    addressAndAmount: AddressMap  — recipients + amounts
    //
    //  Yêu cầu: gọi token.approve(MultiSenderAddress, total) TRƯỚC
    // ─────────────────────────────────────────────────────────────
    @method(
        {
            name: 'tokenAddress',
            type: ABIDataTypes.ADDRESS,
        },
        {
            name: 'addressAndAmount',
            type: ABIDataTypes.ADDRESS_UINT256_TUPLE,
        },
    )
    @emit('MultiSentToken')
    @returns({
        name: 'success',
        type: ABIDataTypes.BOOL,
    })
    public multiSendToken(calldata: Calldata): BytesWriter {
        const tokenAddress: Address       = calldata.readAddress();
        const addressAndAmount: AddressMap<u256> = calldata.readAddressMapU256();
        const addresses: Address[]        = addressAndAmount.keys();

        if (addresses.length === 0) {
            throw new Error('No recipients provided');
        }
        if (addresses.length > this.MAX_RECIPS) {
            throw new Error('Exceeds 200 recipients per transaction');
        }

        // Tính tổng token cần pull từ sender
        let totalTokens: u256 = u256.Zero;
        for (let i: i32 = 0; i < addresses.length; i++) {
            const address = addresses[i];
            if (!address) throw new Error('Invalid recipient address');
            totalTokens = SafeMath.add(totalTokens, addressAndAmount.get(address));
        }

        // Cross-contract: transferFrom(sender → MultiSender)
        // Người dùng phải approve trước
        const transferFromMap = new AddressMap<u256>();
        transferFromMap.set(Blockchain.tx.origin, totalTokens);

        Blockchain.call(tokenAddress, 'transferFrom', new Calldata(
            this._encodeTransferFrom(
                Blockchain.tx.origin,
                Blockchain.contractAddress,
                totalTokens,
            ),
        ));

        // Phân phối token đến từng địa chỉ opt1
        for (let i: i32 = 0; i < addresses.length; i++) {
            const address = addresses[i];
            const amount  = addressAndAmount.get(address);
            Blockchain.call(tokenAddress, 'transfer', new Calldata(
                this._encodeTransfer(address, amount),
            ));
        }

        return new BytesWriter(0);
    }

    // ─────────────────────────────────────────────────────────────
    //  withdrawFees — chỉ deployer mới được gọi
    // ─────────────────────────────────────────────────────────────
    @method({
        name: 'to',
        type: ABIDataTypes.ADDRESS,
    })
    @emit('FeesWithdrawn')
    @returns({
        name: 'amount',
        type: ABIDataTypes.UINT256,
    })
    public withdrawFees(calldata: Calldata): BytesWriter {
        this.onlyDeployer(Blockchain.tx.sender);

        const to: Address = calldata.readAddress();
        const bal: u256   = Blockchain.getBalance(Blockchain.contractAddress);

        if (bal.lte(u256.Zero)) {
            throw new Error('No fees accumulated');
        }

        Blockchain.transfer(to, bal);

        const writer = new BytesWriter(32);
        writer.writeU256(bal);
        return writer;
    }

    // ─── Private helpers ──────────────────────────────────────────
    private _encodeTransferFrom(from: Address, to: Address, amount: u256): Uint8Array {
        const w = new BytesWriter(96);
        w.writeAddress(from);
        w.writeAddress(to);
        w.writeU256(amount);
        return w.getBuffer();
    }

    private _encodeTransfer(to: Address, amount: u256): Uint8Array {
        const w = new BytesWriter(64);
        w.writeAddress(to);
        w.writeU256(amount);
        return w.getBuffer();
    }
}
