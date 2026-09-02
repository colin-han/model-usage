mod api;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_store::Builder::new().build())
    .setup(|app| {
      // 配置 macOS 毛玻璃效果和原生圆角
      #[cfg(target_os = "macos")]
      {
        use tauri::Manager;
        use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial, NSVisualEffectState};

        let window = app.get_webview_window("main").unwrap();

        // 应用 macOS 毛玻璃效果，始终保持在活动状态（不随焦点变化）
        apply_vibrancy(
          &window,
          NSVisualEffectMaterial::HudWindow,
          Some(NSVisualEffectState::Active),
          Some(20.0)
        ).expect("Unsupported platform! 'apply_vibrancy' is only supported on macOS");
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
      api::fetch_claude_code_usage,
      api::fetch_volcengine_balance,
      api::fetch_aliyun_balance,
      api::get_disk_usage,
      api::load_settings,
      api::save_settings,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
