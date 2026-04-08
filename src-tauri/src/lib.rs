mod api;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_store::Builder::new().build())
    .setup(|app| {
      // 配置 macOS 毛玻璃效果 - 配置已在 tauri.conf.json 中设置
      #[cfg(target_os = "macos")]
      {
        use tauri::Manager;
        let window = app.get_webview_window("main").unwrap();
        // 启用窗口震动效果 (vibrancy) 实现毛玻璃
        let _ = window.set_effects(tauri::window::EffectsBuilder::new()
          .effect(tauri::window::Effect::HudWindow)
          .state(tauri::window::EffectState::Active)
          .build()
        );
      }

      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      api::fetch_zhipu_quota,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
