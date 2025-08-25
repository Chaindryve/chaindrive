import React, { useEffect, useState } from "react";
import { Alert, Text, View, Linking } from "react-native";
import { ReactNativeModal } from "react-native-modal";

import CustomButton from "@/components/CustomButton";

interface SendIcpButtonProps {
  recipientAddress: string; // ICP principal or account ID
  amount: number; // ICP amount in decimal (e.g., 0.1)
}

const SendIcpButton = ({ recipientAddress, amount }: SendIcpButtonProps) => {
  const [success, setSuccess] = useState(false);

  // Convert ICP to e8s
  const icpToE8s = (icp: number) => Math.round(icp * 1e8);

  // Open Plug wallet to send ICP
  const sendIcpWithPlug = async () => {
    const e8s = icpToE8s(amount);

    const plugUrl = `https://plugwallet.ooo/plug?requestTransfer=${encodeURIComponent(
      JSON.stringify({
        to: recipientAddress,
        amount: e8s,
        returnUrl: "myapp://icp-payment-success",
        memo: "Payment",
      }),
    )}`;

    try {
      const supported = await Linking.canOpenURL(plugUrl);
      if (!supported) {
        Alert.alert(
          "Plug Wallet Not Installed",
          "Please install Plug Wallet to make the payment.",
        );
        return;
      }

      await Linking.openURL(plugUrl);
    } catch (error) {
      Alert.alert("Error", "Failed to open Plug wallet: " + String(error));
    }
  };

  // Handle returnURL from Plug
  useEffect(() => {
    const subscription = Linking.addListener("url", (event) => {
      if (event.url.includes("icp-payment-success")) {
        setSuccess(true);
      }
    });

    return () => subscription.remove();
  }, []);

  return (
    <View style={{ margin: 20 }}>
      <CustomButton title={`Send ${amount} ICP`} onPress={sendIcpWithPlug} />

      <ReactNativeModal
        isVisible={success}
        onBackdropPress={() => setSuccess(false)}
      >
        <View
          style={{ backgroundColor: "white", padding: 20, borderRadius: 16 }}
        >
          <Text style={{ fontSize: 18, fontWeight: "bold", marginBottom: 10 }}>
            Payment Successful
          </Text>
          <Text>Your ICP payment has been completed successfully.</Text>
          <CustomButton title="Close" onPress={() => setSuccess(false)} />
        </View>
      </ReactNativeModal>
    </View>
  );
};

export default SendIcpButton;
