// Add to the MAIN app target in Xcode (after `npx cap add ios`).
// Exposes a built-in "Add Expense" action to Siri, Shortcuts, and Back Tap —
// no hand-built Shortcut needed. It opens the app to the Add screen via deep link.
//
// Requires a URL scheme in Info.plist:
//   CFBundleURLTypes → URL Schemes → "expensetracker"

import AppIntents
import UIKit

@available(iOS 16.0, *)
struct AddExpenseIntent: AppIntent {
    static var title: LocalizedStringResource = "Add Expense"
    static var openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult {
        if let url = URL(string: "expensetracker://add") {
            await UIApplication.shared.open(url)
        }
        return .result()
    }
}

@available(iOS 16.0, *)
struct ExpenseShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: AddExpenseIntent(),
            phrases: [
                "Add expense in \(.applicationName)",
                "Log spending in \(.applicationName)"
            ],
            shortTitle: "Add Expense",
            systemImageName: "plus.circle.fill"
        )
    }
}
