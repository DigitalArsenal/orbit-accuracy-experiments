// Thin native public-function benchmark. No reimplemented orbital physics.
// References, frames, units and epoch labels: the supplied CARA CSV/NOTICE.
#include "conjunction/pc_fallbacks.h"
#include <chrono>
#include <ctime>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <vector>
using namespace conjunction;
using Row=std::vector<std::string>;
std::vector<Row> csv(const std::string& file){
    std::ifstream f(file);if(!f)throw std::runtime_error("Missing fixture "+file);
    std::string line;std::getline(f,line);std::vector<Row> rows;
    while(std::getline(f,line)){std::stringstream stream(line);Row row;std::string value;while(std::getline(stream,value,','))row.push_back(value);rows.push_back(row);}return rows;
}
PcEncounter encounter(const Row& row){
    PcEncounter e;e.has_velocity_covariance=true;size_t at=1;
    for(double& x:e.primary)x=std::stod(row[at++]);for(double& x:e.secondary)x=std::stod(row[at++]);
    for(double& x:e.covariance_primary)x=std::stod(row[at++]);for(double& x:e.covariance_secondary)x=std::stod(row[at++]);
    e.combined_radius=std::stod(row[at]);return e;
}
template<class Function> auto timed(unsigned repetition,const std::string& name,const char* method,Function function){
    const auto wall=std::chrono::steady_clock::now();const auto cpu=std::clock();auto r=function();
    const double seconds=double(std::clock()-cpu)/CLOCKS_PER_SEC;
    const double elapsed=std::chrono::duration<double>(std::chrono::steady_clock::now()-wall).count();
    std::cout<<repetition<<','<<name<<','<<method<<','<<seconds<<','<<elapsed<<',';
    return r;
}
void result(const PcFallbackResult& r){
    std::cout<<r.expected_collisions<<','<<r.pc.probability<<','<<r.pc.converged<<','<<r.pc.iterations<<','<<r.requires_3d<<','<<r.requires_monte_carlo<<','<<r.covariance_repaired<<','<<r.time_start<<','<<r.time_end<<'\n'<<std::flush;
}
int main(int argc,char** argv){try{
    if(argc!=3)throw std::runtime_error("risk-profile <fixture-directory> <repetitions>");
    const auto usage=csv(std::string(argv[1])+"/cara_usage.csv"),hall=csv(std::string(argv[1])+"/cara_hall.csv");
    if(usage.size()!=8||hall.size()!=12)throw std::runtime_error("Reference population differs");
    const unsigned repetitions=std::stoul(argv[2]);if(!repetitions)throw std::runtime_error("No repetitions");
    std::cout<<std::setprecision(17)<<"repetition,case,method,cpu_seconds,wall_seconds,Nc,Pc,converged,iterations,requires_3d,requires_mc,repaired,time_start,time_end\n";
    for(unsigned repeat=0;repeat<repetitions;++repeat){
        for(const auto& row:usage){const auto e=encounter(row);
            const auto u=timed(repeat,row[0],"USAGE",[&]{return assess_pc_usage(e);});
            if(u.violated!=(std::stoi(row[86])!=0))throw std::runtime_error("Published usage classification differs");
            std::cout<<",,"<<u.fully_evaluated<<",0,"<<u.violated<<",0,"<<u.covariance_repaired<<','<<u.time_start<<','<<u.time_end<<'\n'<<std::flush;
            const auto n=timed(repeat,row[0],"NC2_HALL",[&]{return pc_2d_nc_hall(e);});result(n);
            if(n.pc.converged&&std::abs(n.expected_collisions/std::stod(row[87])-1)>1e-4)throw std::runtime_error("Published Nc2 tolerance failed");
            if(!n.pc.converged&&!n.requires_3d)throw std::runtime_error("Failed series has no escalation");
        }
        for(const auto& row:hall){auto e=encounter(row);PcFallbackOptions options;options.time_start=std::stod(row[88]);options.time_end=std::stod(row[89]);
            const auto n=timed(repeat,row[0],"NC3_HALL",[&]{return pc_3d_nc_hall(e,options);});result(n);
            if(!n.pc.converged||std::abs(n.expected_collisions/std::stod(row[86])-1)>std::stod(row[87]))throw std::runtime_error("Published Nc3 tolerance failed");
        }
    }return 0;
}catch(const std::exception& error){std::cerr<<error.what()<<'\n';return 1;}}
