import { NextResponse } from "next/server";
import { ethers } from "ethers";
import { BLOCKNOGOTCHI_CONTRACT_ADDRESS } from "@/app/utils/config";
import BlocknogotchiContract from "@/contract/BlocknogotchiContract.json";

// Keep track of the last transaction for each battle pair
const battleTransactions = new Map<string, string>();

// Add these interfaces at the top of the file
interface ErrorWithMessage {
  message?: string;
}

interface ApiResponse {
  success: boolean;
  transactionHash?: string;
  message?: string;
  error?: string;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { winnerTokenId, loserTokenId } = body;

    // Create a unique key for this battle pair (order doesn't matter)
    const battleKey = [winnerTokenId, loserTokenId].sort().join("-");

    // Check if we already have a transaction hash for this battle
    const existingTxHash = battleTransactions.get(battleKey);
    if (existingTxHash) {
      return NextResponse.json({
        success: true,
        transactionHash: existingTxHash,
        message: "Battle already recorded",
      });
    }

    // Get private key from environment variable
    const privateKey = process.env.NEXT_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error("Private key not found in environment variables");
    }

    // Initialize provider and wallet
    const provider = new ethers.JsonRpcProvider(
      "https://sepolia-rpc.scroll.io/"
    );
    const wallet = new ethers.Wallet(privateKey, provider);

    // Initialize contract with signer
    const contract = new ethers.Contract(
      BLOCKNOGOTCHI_CONTRACT_ADDRESS,
      BlocknogotchiContract.abi,
      wallet
    );

    // Calculate experience
    const winnerExperience = 100;
    const loserExperience = 50;

    try {
      // Call the recordBattle function
      const tx = await contract.recordBattle(
        winnerTokenId,
        loserTokenId,
        winnerExperience,
        loserExperience
      );

      // Wait for transaction to be mined
      const receipt = await tx.wait();

      // Store the transaction hash for this battle
      battleTransactions.set(battleKey, receipt.hash);

      // Clean up old transactions after 5 minutes
      setTimeout(() => {
        battleTransactions.delete(battleKey);
      }, 5 * 60 * 1000);

      return NextResponse.json({
        success: true,
        transactionHash: receipt.hash,
      });
    } catch (error: unknown) {
      if (error && typeof error === "object" && "message" in error) {
        const typedError = error as ErrorWithMessage;
        if (typedError.message?.includes("already known")) {
          // If the transaction is already known, wait briefly and check for the hash
          await new Promise((resolve) => setTimeout(resolve, 2000));
          const existingTxHash = battleTransactions.get(battleKey);
          if (existingTxHash) {
            return NextResponse.json({
              success: true,
              transactionHash: existingTxHash,
              message: "Battle already recorded",
            });
          }
        }
      }
      throw error;
    }
  } catch (error: unknown) {
    console.error("Error recording battle:", error);
    const errorMessage =
      error && typeof error === "object" && "message" in error
        ? (error as ErrorWithMessage).message
        : "Unknown error";

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      } as ApiResponse,
      { status: 500 }
    );
  }
}
