import "./src/lib/crypto-polyfill";
import "react-native-gesture-handler";
import { LogBox } from "react-native";
import { registerGlobals } from "@livekit/react-native";
import { registerRootComponent } from "expo";
import App from "./App";

LogBox.ignoreLogs(["error reading from signal stream", "WS closed unexpectedly"]);
registerGlobals();

registerRootComponent(App);
