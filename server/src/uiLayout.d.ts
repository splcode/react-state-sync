// TODO: We need to figure out how to expose these types to state-client & ui libs.
// Maybe we need a separate @types/@splcode/state-server package?
declare module "uiLayout" {
  // Layout of UI components for each tab
  export interface UiLayout {
    // The video tab
    video: UiDevice[]
  }

  export interface UiDeviceComponent {
    // id of the initialized device
    // set by device's key in config.yaml
    // used to prefix connectedState channels
    id: string;
    // the component to render for a device instance
    component: UiComponent;
  }

  // Types of UI components that drivers may return
  // TODO: Each device ui method should return a UiComponent
  export type UiComponent
    = UiGroup
    | UiCard
    | UiStack
    | UiCentered
    | UiToggleButton
    | UiText
    | UiTextMeter

  // Generic group of subcomponents
  //
  // TODO: can we combine group/card/stack/centered into one type
  // maybe with a field like subType: 'card' | 'box' | 'centered' | 'stack'
  export interface UiGroup {
    type: 'group';
    // style props for mantine's Box component
    styleProps: {[k: string]: string}
    // child components
    components: UiComponent[];
  }

  // Card wrapper of subcomponents
  export interface UiCard {
    type: 'card',
    // style props for mantine's Card component
    styleProps: {[k: string]: string},
    components: UiComponent[];
  }

  // Vertical stack of subcomponents
  export interface UiStack {
    type: 'stack',
    // style props for mantine's Stack component
    styleProps: {[k: string]: string},
    components: UiComponent[];
  }

  // Centered group of subcomponents
  export interface UiCentered {
    type: 'center',
    // style props for mantine's Center component
    styleProps: {[k: string]: string},
    components: UiComponent[];
  }

  // A button that toggles between options
  // Sends values to a meter on change
  export interface UiToggleButton {
    type: 'toggleButton';
    // Text values to cycle the button between
    values: string[];
    // Transform button values into values we send to the meter
    //
    // If a value is not present here, we send the raw string to the meter
    valueMapping: {[k: string]: any}
    // The meter we push to when the button is toggled
    // will be prefixed with `<device-id>/`
    meter: string;
  }

  // Static text
  export interface UiText {
    type: 'text';
    styleProps: {[k: string]: string}
    content: string;
  }

  // Text from a Meter
  export interface UiTextMeter {
    type: 'textMeter';
    // style props for mantine's Text component
    styleProps: {[k: string]: string}
    // will be prefixed with `<device-id>/`
    meter: string;
    // optional text to render if meter returns null or undefined
    fallbackContent?: string;
  }
}
