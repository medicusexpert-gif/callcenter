/*
========================================
MEDICUS Planner v1.0.0
========================================
*/


const SHEET_ID =
"1WeR2J62zroTUDGRFnd-Z4bQe196XiP7Kt1Rd_P3SR3M";



const months = {

    "STYCZEŃ":"1901112775",
    "LUTY":"761522376",
    "MARZEC":"427047031",
    "KWIECIEŃ":"1456994350",
    "MAJ":"605689359",
    "CZERWIEC":"1218108803",
    "LIPIEC":"975199346",
    "SIERPIEŃ":"878375304",
    "WRZESIEŃ":"1634226018",
    "PAŹDZIERNIK":"954794309",
    "LISTOPAD":"930192024",
    "GRUDZIEŃ":"1626189679"

};





let currentMonth =
localStorage.getItem("plannerMonth") || "MAJ";





const technicians = [

    "PRZEMEK",
    "RAFAŁ",
    "MARCIN",
    "MICHAŁ"

];





const colors = [

    "przemek",
    "rafal",
    "marcin",
    "michal"

];







function csvUrl(month){


    return (
        `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${months[month]}`
    );


}








async function loadPlanner(){


try{


    const response =
    await fetch(csvUrl(currentMonth));



    const text =
    await response.text();



    const rows =
    text
    .replace(/\r/g,"")
    .split("\n")
    .filter(row=>row.trim());





    const data=[];




    rows.forEach(row=>{


        const cols =
        parseCSVLine(row);



        if(
            cols.length >= 6 &&
            /^\d{4}-\d{2}-\d{2}$/.test(cols[1])
        ){


            data.push({

                date:cols[1],

                tasks:[

                    cols[2] || "",
                    cols[3] || "",
                    cols[4] || "",
                    cols[5] || ""

                ]

            });


        }


    });







    drawPlanner(data);




    document
    .getElementById("current-month")
    .innerHTML =
    `${currentMonth} 2026`;




    document
    .getElementById("info")
    .innerHTML =

    `MEDICUS Planner v1.0.5 |
    ${currentMonth} |
    dni robocze: ${data.length}`;





}

catch(error){


    console.error(error);


    document
    .getElementById("info")
    .innerHTML =
    "Błąd: " + error.message;


}



}










function drawPlanner(data){


const planner =
document.getElementById("planner");



planner.innerHTML="";







planner.innerHTML += `

<div class="cell header">
DATA
</div>

`;





technicians.forEach(t=>{


    planner.innerHTML += `

    <div class="cell header">
        ${t}
    </div>

    `;


});









data.forEach(row=>{


const day =
getDayName(row.date);





if(
    day==="Sobota" ||
    day==="Niedziela"
){

    return;

}








planner.innerHTML += `

<div class="cell date">

${shortDay(day)}

<br>

${formatDate(row.date)}

</div>

`;









row.tasks.forEach((task,index)=>{



const card =
parseTask(task);





planner.innerHTML += `

<div class="cell">


<div 
class="card ${colors[index]}"
data-full="${escapeHtml(task)}">



<div class="task-type">

${card.icon} ${card.type}

</div>



<div class="task-main">

${card.main}

</div>





${card.lines.map(line=>`

<div class="task-line">
${line}
</div>

`).join("")}




</div>


</div>


`;




});





});



}
// ========================================
// PARSER ZADAŃ
// ========================================


function parseTask(text){

    let t = text.trim();


    if(!t){

        return {
            type:"",
            icon:"",
            main:"",
            lines:[]
        };

    }



    // =========================
    // URLOP
    // =========================

    if(t.toLowerCase().includes("urlop")){

        return {

            type:"URLOP",
            icon:"🏖",
            main:"Urlop",
            lines:[]

        };

    }




    // =========================
    // BIURO
    // =========================

    if(/^B\s*:/i.test(t)){

        let clean =
        t.replace(/^B\s*:/i,"").trim();


        return {

            type:"BIURO",
            icon:"🏢",
            main:getTime(clean),
            lines:[

                removeTime(clean)

            ]

        };

    }





    // =========================
    // GODZINA NA POCZĄTKU
    // np. 12:00 INWENTARYZACJA
    // =========================

    let timeMatch =
    t.match(/^(\d{1,2}:\d{2})\s*(.*)$/);


    if(timeMatch){

        return {

            type:"ZADANIE",
            icon:"📌",

            main:
            timeMatch[2],

            lines:[

                "(od " + timeMatch[1] + ")"

            ]

        };

    }





    // =========================
    // TOWAR
    // =========================

    if(/TOWAR/i.test(t)){


        return {

            type:"TOWAR",
            icon:"📦",

            main:t
            .replace(/TOWAR/i,"")
            .trim(),

            lines:[]

        };

    }





    // =========================
    // CZAS PRACY
    // np. 8-16
    // =========================

    if(
        /\b\d{1,2}[-]\d{1,2}\b/.test(t)
    ){

        return {

            type:"CZAS PRACY",
            icon:"🕗",

            main:t,

            lines:[]

        };

    }





    // =========================
    // WYJAZD
    // NIE WYCIĄGAMY NUMERÓW
    // =========================

    if(
        /\b\d{2,4}\b/.test(t)
    ){

        return {

            type:"WYJAZD",
            icon:"🔧",

            main:t,

            lines:[]

        };

    }





    // =========================
    // ZWYKŁE ZADANIE
    // =========================

    return {

        type:"ZADANIE",
        icon:"📌",

        main:t,

        lines:[]

    };


}


// ========================================
// POMOCNICZE
// ========================================



function findNumber(text){


    const match =
    text.match(/\b\d{2,4}\b/);


    return match ? match[0] : "";


}







function getTime(text){


    const match =
    text.match(
        /\d{1,2}[:.-]\d{2}\s*[-]\s*\d{1,2}(:\d{2})?|\b8-16\b/
    );


    return match ? match[0] : "";


}







function removeTime(text){


    return text
    .replace(
        /\d{1,2}[:.-]\d{2}\s*[-]\s*\d{1,2}/,
        ""
    )
    .replace(
        /\b8-16\b/,
        ""
    )
    .trim();


}







function cleanText(text){


    return text

    .replace(/.*TOWAR/i,"")

    .replace(/\(TABLICA WYJAZDY\)/i,"")

    .trim();


}









// ========================================
// DATY
// ========================================


function getDayName(date){


    const p =
    date.split("-");



    return [

        "Niedziela",
        "Poniedziałek",
        "Wtorek",
        "Środa",
        "Czwartek",
        "Piątek",
        "Sobota"

    ][


        new Date(

            p[0],
            p[1]-1,
            p[2]

        ).getDay()


    ];


}









function shortDay(day){


    return {


        "Poniedziałek":"Pon",

        "Wtorek":"Wt",

        "Środa":"Śr",

        "Czwartek":"Czw",

        "Piątek":"Pt"


    }[day] || "";



}









function formatDate(date){


    const p =
    date.split("-");


    return `${p[2]}.${p[1]}`;


}









// ========================================
// CSV
// ========================================


function parseCSVLine(line){



    const result=[];

    let current="";

    let insideQuotes=false;





    for(let i=0;i<line.length;i++){


        const char=line[i];



        if(char === '"'){


            insideQuotes =
            !insideQuotes;


            continue;

        }






        if(
            char === "," &&
            !insideQuotes
        ){


            result.push(
                current.trim()
            );


            current="";


        }
        else{


            current += char;


        }


    }






    result.push(
        current.trim()
    );



    return result;



}









function escapeHtml(text){


    return text

    .replace(/&/g,"&amp;")

    .replace(/</g,"&lt;")

    .replace(/>/g,"&gt;")

    .replace(/"/g,"&quot;")

    .replace(/'/g,"&#039;");


}









// ========================================
// ZMIANA MIESIĄCA
// ========================================


document
.querySelectorAll("#month-bar button")
.forEach(btn=>{


    btn.onclick=function(){



        document
        .querySelectorAll("#month-bar button")
        .forEach(b=>

            b.classList.remove("active")

        );





        this.classList.add("active");





        currentMonth =
        this.dataset.month;





        localStorage.setItem(
            "plannerMonth",
            currentMonth
        );





        loadPlanner();




    };


});









// ustawienie aktywnego miesiąca po starcie


document
.querySelectorAll("#month-bar button")
.forEach(btn=>{


    if(
        btn.dataset.month === currentMonth
    ){

        btn.classList.add("active");

    }


});









// START


loadPlanner();

// ========================================
// AUTO ODŚWIEŻANIE DANYCH
// ========================================

setInterval(()=>{

    loadPlanner();

}, 5 * 60 * 1000);
