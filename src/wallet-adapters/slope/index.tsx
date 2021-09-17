// @ts-ignore
import EventEmitter from "eventemitter3";
import { PublicKey, Transaction } from "@solana/web3.js";
import { notify } from "../../utils/notifications";
import { DEFAULT_PUBLIC_KEY, WalletAdapter } from "../types";
// @ts-ignore
import bs58 from "bs58";

interface SlopeProvider {
  publicKey?: PublicKey;
  isConnected?: boolean;
  connect(): Promise<{
    msg: string;
    data: {
        publicKey?: string;
    };
  }>;
  disconnect(): Promise<{ msg: string }>;
  signTransaction(message: string): Promise<{
      msg: string;
      data: {
          publicKey?: string;
          signature?: string;
      };
  }>;
  signAllTransactions(messages: string[]): Promise<{
      msg: string;
      data: {
          publicKey?: string;
          signatures?: string[];
      };
  }>;
}

export class SlopeExtensionWalletAdapter
  extends EventEmitter
  implements WalletAdapter
{
  _provider: SlopeProvider | undefined;

  constructor() {
    super();
    this.connect = this.connect.bind(this);
  }

  get connected() {
    return this._provider?.isConnected || false;
  }

  get autoApprove() {
    return false;
  }

  async signAllTransactions(
    transactions: Transaction[]
  ): Promise<Transaction[]> {
    if (!this._provider) {
      return transactions;
    }

    const wallet = new (window as any).Slope()
    if (!wallet) {
      return transactions
    }

    const messages = transactions.map((transaction) => bs58.encode(transaction.serializeMessage()));
    const { data } = await wallet.signAllTransactions(messages);

    const length = transactions.length;

    if (!data.publicKey || data.signatures?.length !== length) {
      return transactions
    }

    const publicKey = new PublicKey(data.publicKey);

    for (let i = 0; i < length; i++) {
        transactions[i].addSignature(publicKey, bs58.decode(data.signatures[i]));
    }

    return transactions;
  }

  get publicKey() {
    return this._provider?.publicKey || DEFAULT_PUBLIC_KEY;
  }

  async signTransaction(transaction: Transaction) {
    if (!this._provider) {
      return transaction;
    }
    const wallet = new (window as any).Slope()
    const message = bs58.encode(transaction.serializeMessage());
    const { data } = await wallet.signTransaction(message);

    if (!data.publicKey || !data.signature) {
      return transaction
    }

    const publicKey = new PublicKey(data.publicKey);
    const signature = bs58.decode(data.signature);

    transaction.addSignature(publicKey, signature);
    return transaction;
  }

  connect = async () => {
    if (this._provider) {
      return;
    }

    let provider: SlopeProvider;
    if ((window as any)?.Slope) {
      provider = new (window as any).Slope();
      if (!provider) {
        return;
      }

      const { data } = await provider.connect();
      if (data.publicKey) {
        this._provider = provider;
        this._provider.publicKey = new PublicKey(data.publicKey);
        this._provider.isConnected = true;
        this.emit("connect");
      } else {
        this.disconnect()
      }
    } else {
      window.open("https://www.slope.finance/#/wallet", "_blank");
      notify({
        message: "Slope Error - Please install Slope wallet from Chrome",
        variant: "error",
      });
      return;
    }
  };

  disconnect() {
    if (this._provider) {
      this._provider.disconnect();
      this._provider = undefined;
      this.emit("disconnect");
    }
  }
}
