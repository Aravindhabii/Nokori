// Add via a new Widget Extension target in Xcode:
//   File → New → Target → Widget Extension (name e.g. "ExpenseWidget", no config intent).
// Replace the generated widget file with this. Tapping the widget opens the app to Add.
// (The URL scheme "expensetracker" must be registered in the main app's Info.plist.)

import WidgetKit
import SwiftUI

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> SimpleEntry { SimpleEntry(date: Date()) }
    func getSnapshot(in context: Context, completion: @escaping (SimpleEntry) -> Void) {
        completion(SimpleEntry(date: Date()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<SimpleEntry>) -> Void) {
        completion(Timeline(entries: [SimpleEntry(date: Date())], policy: .never))
    }
}

struct SimpleEntry: TimelineEntry { let date: Date }

struct ExpenseWidgetEntryView: View {
    var entry: Provider.Entry
    var body: some View {
        ZStack {
            Color(red: 0.05, green: 0.58, blue: 0.53)
            VStack(spacing: 2) {
                Text("+").font(.system(size: 28, weight: .bold))
                Text("Add expense").font(.system(size: 12))
            }
            .foregroundColor(.white)
        }
        .widgetURL(URL(string: "expensetracker://add"))
    }
}

@main
struct ExpenseWidget: Widget {
    let kind: String = "ExpenseWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            ExpenseWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Add Expense")
        .description("Quick-add an expense.")
        .supportedFamilies([.systemSmall])
    }
}
