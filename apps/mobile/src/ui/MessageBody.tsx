import { Linking, StyleSheet, Text, type TextStyle } from "react-native";
import { parseBody } from "@relay/chat";
import { colors } from "./theme";

export function MessageBody({ body, style }: { body: string; style?: TextStyle }) {
  const parts = parseBody(body);
  return (
    <Text style={[styles.body, style]}>
      {parts.map((part, i) => {
        if (part.type === "strong")
          return (
            <Text key={i} style={styles.strong}>
              {part.value}
            </Text>
          );
        if (part.type === "em")
          return (
            <Text key={i} style={styles.em}>
              {part.value}
            </Text>
          );
        if (part.type === "code")
          return (
            <Text key={i} style={styles.code}>
              {part.value}
            </Text>
          );
        if (part.type === "strike")
          return (
            <Text key={i} style={styles.strike}>
              {part.value}
            </Text>
          );
        if (part.type === "mention")
          return (
            <Text key={i} style={styles.mention}>
              {part.value}
            </Text>
          );
        if (part.type === "link")
          return (
            <Text key={i} style={styles.link} onPress={() => void Linking.openURL(part.href)}>
              {part.value}
            </Text>
          );
        return <Text key={i}>{part.value}</Text>;
      })}
    </Text>
  );
}

const styles = StyleSheet.create({
  body: { color: colors.ink, fontSize: 16, lineHeight: 22 },
  strong: { fontWeight: "800" },
  em: { fontStyle: "italic" },
  strike: { textDecorationLine: "line-through" },
  code: {
    fontFamily: "Menlo",
    backgroundColor: colors.inputFill,
    fontSize: 14,
  },
  mention: { color: colors.accent, fontWeight: "700" },
  link: { color: colors.accent, textDecorationLine: "underline" },
});
