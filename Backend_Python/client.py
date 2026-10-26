import flet as ft
import requests
import threading

API_URL = "http://127.0.0.1:8000/api/v1/action"

def main(page: ft.Page):
    page.title = "NOVA AI TRPG"
    page.theme_mode = ft.ThemeMode.DARK
    
    page.window.width = 500
    page.window.height = 800
    page.padding = 20

    chat_list = ft.ListView(expand=True, spacing=10, auto_scroll=True)
    
    hp_text = ft.Text("HP: 100/100", weight=ft.FontWeight.BOLD, color=ft.colors.RED_400)
    inventory_text = ft.Text("Інвентар: порожньо", italic=True, color=ft.colors.GREY_400)

    def add_message(sender: str, text: str, color: str):
        chat_list.controls.append(
            ft.Text(f"{sender}:\n{text}", color=color, selectable=True)
        )
        page.update()

    def send_request(action: str):
        try:
            response = requests.post(API_URL, json={"action": action})
            data = response.json()

            if data.get("status") == "success":
                add_message("Оповідач", data["story"], ft.colors.WHITE)
                
                state = data["player_state"]
                hp_text.value = f"HP: {state['hp']}/{state['max_hp']}"
                inv = ", ".join(state["inventory"]) if state["inventory"] else "порожньо"
                inventory_text.value = f"Інвентар: {inv}"
            else:
                add_message("Система", "Помилка сервера", ft.colors.RED)
                
        except Exception as ex:
            add_message("Система", f"Помилка підключення: {ex}", ft.colors.RED)

        user_input.disabled = False
        page.update()

    def send_action(e):
        action = user_input.value
        if action:
            action = action.strip()
            
        if not action:
            return

        add_message("Ти", action, ft.colors.BLUE_200)
        user_input.value = ""
        user_input.disabled = True
        page.update()

        threading.Thread(target=send_request, args=(action,)).start()

    user_input = ft.TextField(hint_text="Що ти робиш?", expand=True, on_submit=send_action)

    # Flet 1.0 любить, коли ми прямо передаємо контроли в Row
    page.add(
        ft.Row(
            controls=[hp_text, inventory_text], 
            alignment=ft.MainAxisAlignment.SPACE_BETWEEN
        ),
        ft.Divider(),
        chat_list,
        ft.Row(
            controls=[
                user_input, 
                ft.IconButton(icon=ft.icons.SEND, icon_color=ft.colors.BLUE_400, on_click=send_action)
            ]
        )
    )


if __name__ == "__main__":
    ft.app(target=main) # type: ignore