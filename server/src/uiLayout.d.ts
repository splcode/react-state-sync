// TODO: We need to figure out how to expose these types to state-client & ui libs.
// Maybe we need a separate @types/@splcode/state-server package?
declare module "uiLayout" {
  // Layout of UI components for each tab
  export interface UiLayout {
    // The video tab
    video: UiComponent[]
  }

  // Types of UI components that drivers may return
  export type UiComponent
    = UiGroup
    | UiToggle
    | UiText

  // Group of subcomponents
  export interface UiGroup {
    type: 'group';
    // direction of stacking
    direction: 'horizontal' | 'vertical';
    // child components
    components: [UiComponent];
  }

  // A toggle switch
  export interface UiToggle {
    type: 'toggle';
  }

  // UI text
  export interface UiText {
    type: 'text';
    content: string;
  }
}
