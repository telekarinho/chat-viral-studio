import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { TeleprompterAction, TeleprompterState } from "@postai/domain";

const TICK_MS = 50;

interface Props {
  text: string;
  state: TeleprompterState;
  dispatch: (a: TeleprompterAction) => void;
  visible: boolean;
}

/** Scroll position is fully driven by the pure reducer (tested in @postai/domain). */
export function Teleprompter({ text, state, dispatch, visible }: Props) {
  const ref = useRef<ScrollView>(null);
  const [content, setContent] = useState(0);
  const [viewport, setViewport] = useState(0);
  const maxOffset = Math.max(0, content - viewport * 0.4);
  const maxRef = useRef(maxOffset);
  maxRef.current = maxOffset;

  const ticking = state.phase === "running" || state.phase === "countdown";
  useEffect(() => {
    if (!ticking) return;
    let last = Date.now();
    const t = setInterval(() => {
      const now = Date.now();
      dispatch({ type: "tick", dtMs: now - last, maxOffset: maxRef.current });
      last = now;
    }, TICK_MS);
    return () => clearInterval(t);
  }, [ticking, dispatch]);

  useEffect(() => {
    ref.current?.scrollTo({ y: state.offset, animated: false });
  }, [state.offset]);

  if (!visible) return null;
  const step = state.fontSize * 1.4 * 2; // two lines
  return (
    <View style={st.wrap} pointerEvents="box-none" testID="teleprompter">
      <ScrollView
        ref={ref}
        style={{ flex: 1 }}
        scrollEnabled={false}
        onLayout={(e) => setViewport(e.nativeEvent.layout.height)}
        onContentSizeChange={(_w, h) => setContent(h)}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: viewport * 0.6 }}
      >
        <Text
          testID="teleprompter-text"
          style={[st.text, { fontSize: state.fontSize, lineHeight: state.fontSize * 1.4, transform: state.mirrored ? [{ scaleX: -1 }] : [] }]}
        >
          {text}
        </Text>
      </ScrollView>
      <View style={st.manual}>
        <Pressable accessibilityRole="button" accessibilityLabel="Voltar texto" style={st.arrow} onPress={() => dispatch({ type: "advance", px: -step, maxOffset })} testID="prompter-back">
          <Text style={st.arrowText}>▲</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Avançar texto" style={st.arrow} onPress={() => dispatch({ type: "advance", px: step, maxOffset })} testID="prompter-forward">
          <Text style={st.arrowText}>▼</Text>
        </Pressable>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { position: "absolute", top: 70, left: 12, right: 12, height: "42%", backgroundColor: "rgba(0,0,0,0.45)", borderRadius: 16, paddingHorizontal: 14, flexDirection: "row" },
  text: { color: "#FFFFFF", fontWeight: "700", textShadowColor: "rgba(0,0,0,0.6)", textShadowRadius: 4 },
  manual: { justifyContent: "center", gap: 10, paddingLeft: 6 },
  arrow: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  arrowText: { color: "#FFFFFF", fontSize: 16 },
});
