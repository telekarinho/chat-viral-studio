import { useReducer } from "react";
import { Pressable, Text } from "react-native";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { initialTeleprompter, teleprompterReducer } from "@postai/domain";
import { Teleprompter } from "../src/components/Teleprompter";

function Harness() {
  const [state, dispatch] = useReducer(teleprompterReducer, { ...initialTeleprompter, countdownSeconds: 1 });
  return (
    <>
      <Teleprompter text={"linha\n".repeat(80)} state={state} dispatch={dispatch} visible />
      <Text testID="phase">{`${state.phase}|${Math.round(state.offset)}|${state.mirrored}|${state.fontSize}`}</Text>
      <Btn id="start" onPress={() => dispatch({ type: "start" })} />
      <Btn id="mirror" onPress={() => dispatch({ type: "toggleMirror" })} />
      <Btn id="pause" onPress={() => dispatch({ type: "pause" })} />
      <Btn id="font" onPress={() => dispatch({ type: "setFontSize", value: 40 })} />
    </>
  );
}
const Btn = ({ id, onPress }: { id: string; onPress: () => void }) => <Pressable testID={id} onPress={onPress} />;

describe("Teleprompter", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("contagem regressiva, rolagem automática, pausa, espelho, fonte e avanço manual", () => {
    render(<Harness />);
    const phase = () => String(screen.getByTestId("phase").props.children).split("|");
    fireEvent(screen.getByTestId("teleprompter-text").parent!.parent!, "layout", { nativeEvent: { layout: { height: 300 } } });
    fireEvent(screen.getByTestId("teleprompter-text").parent!.parent!, "contentSizeChange", 300, 4000);
    fireEvent.press(screen.getByTestId("start"));
    expect(phase()[0]).toBe("countdown");
    act(() => jest.advanceTimersByTime(1100));
    expect(phase()[0]).toBe("running");
    act(() => jest.advanceTimersByTime(2000));
    const moved = Number(phase()[1]);
    expect(moved).toBeGreaterThan(0);
    fireEvent.press(screen.getByTestId("pause"));
    act(() => jest.advanceTimersByTime(2000));
    expect(Number(phase()[1])).toBe(moved);
    fireEvent.press(screen.getByTestId("prompter-forward"));
    expect(Number(phase()[1])).toBeGreaterThan(moved);
    fireEvent.press(screen.getByTestId("mirror"));
    expect(screen.getByTestId("teleprompter-text")).toHaveStyle({ transform: [{ scaleX: -1 }] });
    fireEvent.press(screen.getByTestId("font"));
    expect(screen.getByTestId("teleprompter-text")).toHaveStyle({ fontSize: 40 });
  });
});
